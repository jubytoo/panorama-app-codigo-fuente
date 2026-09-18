'use strict';
// ---------------------------------------------------------------------------
// P18-S1/S2 — declaraciones de NIVEL DE MÓDULO de un archivo CommonJS.
//
// Por qué existe: el 18 sept 2026 `main.js` declaraba dos veces
// `function sha256DeArchivo` a nivel de módulo; V8 liga la ÚLTIMA, y la batería
// P18 —que extraía la primera por su firma— dio un falso verde. Un simple
// `grep '^function X('` no basta: la plantilla del ayudante de parcheo es una
// cadena con `function …` en columna 0 que NO declara nada en el módulo.
//
// Analizador léxico mínimo: salta comentarios, cadenas, plantillas (con `${}`
// anidado) y expresiones regulares, y cuenta llaves de código. Una declaración
// es de módulo si `function` (o `var`) aparece a profundidad 0, fuera de una
// plantilla y en posición de sentencia. La batería lo valida contra V8 (P18-S1e).
// ---------------------------------------------------------------------------
const PALABRAS_ANTES_DE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await']);
const PALABRAS_CLAVE = new Set([...PALABRAS_ANTES_DE_REGEX, 'async', 'function', 'var', 'let', 'const', 'if', 'for', 'while']);
const ID_INICIO = /[\p{L}_$]/u;
const ID_RESTO = /[\p{L}\p{N}_$‌‍]/u;

function declaracionesDeModulo(src) {
  const decl = [];
  const n = src.length;
  let i = 0;
  let prof = 0;
  const plantillas = []; // profundidad a la que se abrió cada `${`
  let prev = '';
  let prevAntes = '';
  const empuja = (t) => { prevAntes = prev; prev = t; };
  const linea = (pos) => src.slice(0, pos).split('\n').length;
  // ¿Una `/` aquí abre una expresión regular (y no es una división)?
  const regexPermitida = () => {
    if (prev === '') return true;
    if (prev.startsWith('punc:')) return prev !== 'punc:)' && prev !== 'punc:]';
    if (prev.startsWith('kw:')) return PALABRAS_ANTES_DE_REGEX.has(prev.slice(3));
    return false; // identificador, número, cadena, plantilla, regex
  };
  const enPosicionDeSentencia = (t) => t === '' || t === 'punc:;' || t === 'punc:}';
  const nombreTras = (k) => {
    while (k < n && /\s/.test(src[k])) k++;
    if (src[k] === '*') { k++; while (k < n && /\s/.test(src[k])) k++; }
    let e = k;
    while (e < n && ID_RESTO.test(src[e])) e++;
    return e > k ? src.slice(k, e) : null;
  };

  function leerPlantilla() { // i apunta justo detrás de '`' o del '}' que cierra un `${`
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; empuja('tmpl'); return; }
      if (c === '$' && src[i + 1] === '{') { i += 2; plantillas.push(prof); prof++; empuja('punc:{'); return; }
      i++;
    }
    throw new Error('plantilla sin cerrar');
  }

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; }
      i++;
      empuja('str');
      continue;
    }
    if (c === '`') { i++; leerPlantilla(); continue; }
    if (c === '/' && regexPermitida()) {
      i++;
      let clase = false;
      while (i < n && src[i] !== '\n') {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (clase) { if (d === ']') clase = false; } else if (d === '[') clase = true; else if (d === '/') break;
        i++;
      }
      i++;
      while (i < n && /[a-z]/i.test(src[i])) i++;
      empuja('regex');
      continue;
    }
    if (ID_INICIO.test(c)) {
      const ini = i;
      i++;
      while (i < n && ID_RESTO.test(src[i])) i++;
      const w = src.slice(ini, i);
      if (prof === 0 && plantillas.length === 0) {
        if (w === 'function' && enPosicionDeSentencia(prev === 'kw:async' ? prevAntes : prev)) {
          const nombre = nombreTras(i);
          // Con `async`, la declaración (y su texto en V8) empieza en `async`.
          const pos = prev === 'kw:async' ? src.lastIndexOf('async', ini) : ini;
          if (nombre) decl.push({ nombre, tipo: 'function', pos, linea: linea(pos) });
        }
        if (w === 'var' && enPosicionDeSentencia(prev)) {
          const nombre = nombreTras(i);
          if (nombre) decl.push({ nombre, tipo: 'var', pos: ini, linea: linea(ini) });
        }
      }
      empuja((PALABRAS_CLAVE.has(w) ? 'kw:' : 'id:') + w);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      while (i < n && /[\w.]/.test(src[i])) i++;
      empuja('num');
      continue;
    }
    if (c === '{') { prof++; i++; empuja('punc:{'); continue; }
    if (c === '}') {
      if (plantillas.length && plantillas[plantillas.length - 1] === prof - 1) {
        plantillas.pop();
        prof--;
        i++;
        leerPlantilla();
        continue;
      }
      prof--;
      if (prof < 0) throw new Error('llaves desequilibradas en la línea ' + linea(i));
      i++;
      empuja('punc:}');
      continue;
    }
    i++;
    empuja('punc:' + c);
  }
  if (prof !== 0 || plantillas.length) throw new Error(`fin del texto con profundidad ${prof} y ${plantillas.length} plantilla(s) abierta(s)`);
  return decl;
}

// Nombres declarados más de una vez a nivel de módulo (función o var).
function duplicados(decl) {
  const por = new Map();
  for (const d of decl) {
    if (!por.has(d.nombre)) por.set(d.nombre, []);
    por.get(d.nombre).push(d);
  }
  return [...por.entries()].filter(([, v]) => v.length > 1)
    .map(([nombre, v]) => ({ nombre, lineas: v.map((d) => d.linea), tipos: v.map((d) => d.tipo) }));
}

// Texto exacto de la declaración que empieza en `pos` (hasta la llave que la
// cierra): el primer '}' en el que el trozo queda equilibrado para el analizador.
function textoDeclaracion(src, pos) {
  const cierreParams = src.indexOf(')', pos);
  for (let fin = src.indexOf('}', src.indexOf('{', cierreParams)) + 1; fin > 0; fin = src.indexOf('}', fin) + 1) {
    const trozo = src.slice(pos, fin);
    try {
      declaracionesDeModulo(trozo);
      return trozo;
    } catch (e) { /* todavía no equilibrado */ }
  }
  throw new Error('no se pudo delimitar la declaración en la posición ' + pos);
}

module.exports = { declaracionesDeModulo, duplicados, textoDeclaracion };
