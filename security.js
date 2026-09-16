// ------------------------------------------------------------------
// Cifrado de backups en reposo (funcionalidad "Seguridad" del menú).
// Todo aquí es Node puro (módulo `crypto` nativo, sin dependencias externas)
// — se ejecuta en el proceso principal, nunca en el renderer, así que la
// contraseña y las claves derivadas no pasan por páginas web ni por sitios
// remotos.
//
// Diseño: una única "contraseña maestra" para toda la app (no una por
// proyecto — los backups de TODOS los proyectos se cifran con la misma
// clave). De esa contraseña se deriva una clave AES-256 vía scrypt (con una
// sal aleatoria guardada en app_meta) — la contraseña en sí NUNCA se guarda
// en la base de datos, solo la sal y un "verificador" (un HMAC de la clave
// derivada) que permite comprobar si una contraseña tecleada es la correcta
// sin tener que guardar la contraseña real.
//
// Cada backup se cifra con AES-256-GCM (autenticado: si alguien manipula el
// archivo, el descifrado falla en vez de devolver datos corruptos en
// silencio), con IV aleatorio por backup.
// ------------------------------------------------------------------
const crypto = require('crypto');

const KEY_LEN = 32; // AES-256
// Parámetros de scrypt: coste deliberadamente alto para dificultar fuerza
// bruta offline si alguien copia panorama.sqlite3, pero aún así resuelve en
// menos de medio segundo en hardware normal — aceptable para un login
// interactivo que solo pasa al arrancar la app o al cambiar la contraseña.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function newSaltHex() {
  return crypto.randomBytes(16).toString('hex');
}

function deriveKey(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(String(password), salt, KEY_LEN, SCRYPT_PARAMS);
}

// HMAC de la clave derivada con una etiqueta fija: sirve para comprobar que
// una contraseña tecleada es la correcta (se compara contra este valor
// guardado) sin tener que guardar ni la contraseña ni la clave en sí.
function verifierFor(key) {
  return crypto.createHmac('sha256', key).update('panorama-servicio-security-verify-v1').digest('hex');
}

function encryptString(key, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    panoramaEncrypted: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  });
}

function decryptString(key, envelopeJson) {
  const env = JSON.parse(envelopeJson);
  if (!env || !env.panoramaEncrypted) throw new Error('No es un backup cifrado reconocible');
  const iv = Buffer.from(env.iv, 'base64');
  const tag = Buffer.from(env.tag, 'base64');
  const data = Buffer.from(env.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

// A1 (auditoría 2026-09-13) — ¿el contenido de este archivo ES un sobre
// cifrado por encryptString()? Se usa SOLO por el re-cifrado atómico
// (rekeyAllUserFiles en main.js) para no depender exclusivamente de la
// columna `encrypted` de la base de datos al migrar: si por lo que sea la
// fila y el archivo no coinciden (una fila que dice cifrada sobre un archivo
// en claro, o al revés, heredado de alguna versión anterior), lo que manda
// para decidir si hay que descifrar es lo que de verdad hay en disco.
//
// No cambia ningún lector normal de la app (readBackupPayload, meeting:getPrep
// y readCandidateEvalPayloadForProject siguen guiándose por la columna, igual
// que siempre) — es una comprobación auxiliar, no un cambio de contrato.
//
// Atajo por prefijo primero para no tener que parsear un JSON de más de un
// MB solo para mirar un marcador: encryptString() construye siempre el objeto
// con `panoramaEncrypted` como primera clave, así que ese prefijo cubre el
// caso normal; el JSON.parse queda como red de seguridad para cualquier otra
// forma válida.
function looksEncrypted(raw) {
  if (typeof raw !== 'string' || !raw) return false;
  const head = raw.slice(0, 64).replace(/^\uFEFF/, '').trimStart();
  if (!head.startsWith('{')) return false;
  if (head.startsWith('{"panoramaEncrypted"')) return true;
  try {
    const env = JSON.parse(raw);
    return !!(env && env.panoramaEncrypted);
  } catch (e) {
    return false;
  }
}

module.exports = { newSaltHex, deriveKey, verifierFor, encryptString, decryptString, looksEncrypted };
