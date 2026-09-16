'use strict';
// ---------------------------------------------------------------------------
// GUARD-LOC-1..5 — el guardian de rutas, en aislamiento.
//
// Los casos que ABORTAN se ejecutan en un PROCESO HIJO: `abortar()` llama a
// process.exit(99) y no se puede comprobar desde dentro. Se verifica el codigo
// de salida REAL, no una simulacion.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const G = require('./guardia-rutas.js');

const MARCA = '_a33-guardia-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA);
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

let ok = 0; let mal = 0;
function comp(id, cond, detalle) {
  if (cond) { ok++; console.log(`  [OK]    ${id}${detalle ? '  — ' + detalle : ''}`); }
  else { mal++; console.log(`  [FALLO] ${id}${detalle ? '  — ' + detalle : ''}`); }
}

// Crea un APPDATA falso con el location.json indicado (contenido crudo).
function appdataCon(nombre, crudo) {
  const ad = path.join(RAIZ, 'appdata-' + nombre);
  const dir = path.join(ad, 'panorama-app-config');
  fs.mkdirSync(dir, { recursive: true });
  if (crudo !== null) fs.writeFileSync(path.join(dir, 'location.json'), crudo);
  return ad;
}

// Lanza crearGuardia() en un hijo y devuelve su codigo de salida.
function hijo(cfgLiteral) {
  const f = path.join(RAIZ, 'hijo-' + Math.random().toString(16).slice(2) + '.js');
  fs.writeFileSync(f,
    "const G=require(" + JSON.stringify(path.join(__dirname, 'guardia-rutas.js')) + ");\n" +
    "const g=G.crearGuardia(" + cfgLiteral + ");\n" +
    "if (typeof RUTA !== 'undefined') {}\n", 'utf8');
  try {
    execFileSync(process.execPath, [f], { stdio: 'pipe', env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }) });
    return 0;
  } catch (e) { return e.status == null ? -1 : e.status; }
}
function hijoConSegura(cfgLiteral, ruta) {
  const f = path.join(RAIZ, 'hijo-' + Math.random().toString(16).slice(2) + '.js');
  fs.writeFileSync(f,
    "const G=require(" + JSON.stringify(path.join(__dirname, 'guardia-rutas.js')) + ");\n" +
    "const g=G.crearGuardia(" + cfgLiteral + ");\n" +
    "g.segura(" + JSON.stringify(ruta) + ");\n" +
    "console.log('SEGURA-OK');\n", 'utf8');
  try {
    const out = execFileSync(process.execPath, [f], { stdio: 'pipe', env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }) });
    return { code: 0, out: String(out) };
  } catch (e) { return { code: e.status == null ? -1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
}

console.log('GUARDIA DE RUTAS — GUARD-LOC-1..5');
console.log('');

// -- GUARD-LOC-1: el formato REAL del usuario ------------------------------
{
  const ad = appdataCon('real', JSON.stringify({ userDataDir: 'G:/Mi unidad/BD-PanoramaServicio', shared: true }));
  const r = G.leerUbicacionReal({ appdata: ad });
  comp('GUARD-LOC-1 estado ok', r.estado === 'ok', 'estado=' + r.estado);
  comp('GUARD-LOC-1 clave userDataDir', r.clave === 'userDataDir', 'clave=' + r.clave);
  comp('GUARD-LOC-1 ruta exacta',
    r.ruta === path.resolve('G:/Mi unidad/BD-PanoramaServicio'), 'ruta=' + r.ruta);
  // el lector viejo (`j.dir || j.path`) habria dado null: eso es lo que fallaba
  const viejo = (() => { const j = JSON.parse(fs.readFileSync(path.join(ad, 'panorama-app-config', 'location.json'), 'utf8')); return j.dir || j.path || null; })();
  comp('GUARD-LOC-1 el lector anterior devolvia null', viejo === null, 'viejo=' + viejo);
}

// -- GUARD-LOC-2: BOM / corrupto -> ABORTA, no null ------------------------
{
  const conBom = appdataCon('bom', Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(JSON.stringify({ userDataDir: 'G:/Mi unidad/BD-PanoramaServicio' }), 'utf8')]));
  const r1 = G.leerUbicacionReal({ appdata: conBom });
  comp('GUARD-LOC-2 BOM -> ilegible (no ok, no null)', r1.estado === 'ilegible', 'estado=' + r1.estado);
  comp('GUARD-LOC-2 BOM nombrado en el detalle', /BOM/.test(r1.detalle || ''), r1.detalle);
  const c1 = hijo(`{ marca:'${MARCA}', appdata:${JSON.stringify(conBom)}, vigilarBdViva:false }`);
  comp('GUARD-LOC-2 BOM -> exit 99', c1 === 99, 'exit=' + c1);

  const roto = appdataCon('roto', '{ "userDataDir": "G:/Mi unidad/BD-Panorama');
  const r2 = G.leerUbicacionReal({ appdata: roto });
  comp('GUARD-LOC-2 truncado -> ilegible', r2.estado === 'ilegible', 'estado=' + r2.estado);
  const c2 = hijo(`{ marca:'${MARCA}', appdata:${JSON.stringify(roto)}, vigilarBdViva:false }`);
  comp('GUARD-LOC-2 truncado -> exit 99', c2 === 99, 'exit=' + c2);

  const vacio = appdataCon('vacio', '');
  comp('GUARD-LOC-2 fichero vacio -> ilegible', G.leerUbicacionReal({ appdata: vacio }).estado === 'ilegible');
  const arr = appdataCon('array', '["G:/Mi unidad"]');
  comp('GUARD-LOC-2 JSON que no es objeto -> ilegible', G.leerUbicacionReal({ appdata: arr }).estado === 'ilegible');
}

// -- GUARD-LOC-3: JSON valido sin clave reconocida -> ABORTA ---------------
{
  const ad = appdataCon('sinclave', JSON.stringify({ shared: true, version: 3 }));
  const r = G.leerUbicacionReal({ appdata: ad });
  comp('GUARD-LOC-3 sin clave -> sin-clave', r.estado === 'sin-clave', 'estado=' + r.estado);
  comp('GUARD-LOC-3 el detalle lista las claves presentes', /shared/.test(r.detalle || ''), r.detalle);
  const c = hijo(`{ marca:'${MARCA}', appdata:${JSON.stringify(ad)}, vigilarBdViva:false }`);
  comp('GUARD-LOC-3 -> exit 99', c === 99, 'exit=' + c);

  const vacia = appdataCon('rutavacia', JSON.stringify({ userDataDir: '   ' }));
  comp('GUARD-LOC-3 ruta vacia -> ruta-invalida', G.leerUbicacionReal({ appdata: vacia }).estado === 'ruta-invalida');
  const noStr = appdataCon('rutanum', JSON.stringify({ userDataDir: 42 }));
  comp('GUARD-LOC-3 ruta no-cadena -> ruta-invalida', G.leerUbicacionReal({ appdata: noStr }).estado === 'ruta-invalida');
  const cRV = hijo(`{ marca:'${MARCA}', appdata:${JSON.stringify(noStr)}, vigilarBdViva:false }`);
  comp('GUARD-LOC-3 ruta invalida -> exit 99', cRV === 99, 'exit=' + cRV);
}

// -- GUARD-LOC-4: --base dentro de la ubicacion real -> exit 99 ------------
{
  // ubicacion real simulada dentro del tmp, para no depender de que G: exista
  const real = path.join(RAIZ, 'ubicacion-real-simulada');
  fs.mkdirSync(real, { recursive: true });
  const ad = appdataCon('loc4', JSON.stringify({ userDataDir: real, shared: true }));
  const cfg = `{ marca:'${MARCA}', appdata:${JSON.stringify(ad)}, prohibido:[], vigilarBdViva:false }`;

  const dentro = path.join(real, MARCA, 'sub');
  const r1 = hijoConSegura(cfg, dentro);
  comp('GUARD-LOC-4 dentro de la ubicacion real -> exit 99', r1.code === 99, 'exit=' + r1.code);
  comp('GUARD-LOC-4 el motivo es la ubicacion real', /ubicacion real configurada/.test(r1.out), r1.out.split('\n').filter((l) => /ABORTADO/.test(l)).join('') || '(sin banner)');

  const exacta = hijoConSegura(cfg, real);
  comp('GUARD-LOC-4 la ubicacion real EXACTA -> exit 99', exacta.code === 99, 'exit=' + exacta.code);

  // hermana con el mismo prefijo textual: startsWith() se habria equivocado
  const hermana = path.join(RAIZ, 'ubicacion-real-simulada-OTRA', MARCA);
  const r2 = hijoConSegura(cfg, hermana);
  comp('GUARD-LOC-4 carpeta hermana con el mismo prefijo -> permitida', r2.code === 0, 'exit=' + r2.code);

  // la real de verdad, tal como esta hoy en este PC
  const rHoy = G.leerUbicacionReal({});
  comp('GUARD-LOC-4 este PC: location.json se interpreta', rHoy.estado === 'ok', 'estado=' + rHoy.estado + ' ruta=' + rHoy.ruta);
  comp('GUARD-LOC-4 este PC: apunta a G:', /BD-PanoramaServicio/i.test(rHoy.ruta || ''), rHoy.ruta);
}

// -- GUARD-LOC-5: ruta marcada de pruebas fuera de produccion -> permitida --
{
  const real = path.join(RAIZ, 'ubicacion-real-simulada');
  const ad = appdataCon('loc5', JSON.stringify({ userDataDir: real, shared: true }));
  const cfg = `{ marca:'${MARCA}', appdata:${JSON.stringify(ad)}, prohibido:[], vigilarBdViva:false }`;
  const buena = path.join(RAIZ, MARCA + '-zona', 'trabajo');
  const r = hijoConSegura(cfg, buena);
  comp('GUARD-LOC-5 ruta de pruebas fuera de produccion -> permitida', r.code === 0 && /SEGURA-OK/.test(r.out), 'exit=' + r.code);

  // OJO: fuera de RAIZ. RAIZ ya contiene la marca en su nombre, asi que
  // cualquier ruta colgando de ella la lleva heredada y no prueba nada.
  const sinMarca = hijoConSegura(cfg, path.join(os.tmpdir(), 'zona-sin-marcar'));
  comp('GUARD-LOC-5 sin la marca -> exit 99', sinMarca.code === 99, 'exit=' + sinMarca.code);

  const defecto = hijoConSegura(cfg, path.join(process.env.APPDATA || '', 'panorama-app', MARCA));
  comp('GUARD-LOC-5 carpeta por defecto aunque lleve la marca -> exit 99', defecto.code === 99, 'exit=' + defecto.code);
}

// -- excepcion: location.json ausente ---------------------------------------
{
  const ad = appdataCon('ausente', null);
  const r = G.leerUbicacionReal({ appdata: ad });
  comp('AUSENTE clasificado como ausente (no ilegible)', r.estado === 'ausente', 'estado=' + r.estado);

  const sinAllow = hijo(`{ marca:'${MARCA}', appdata:${JSON.stringify(ad)}, vigilarBdViva:false }`);
  comp('AUSENTE sin raizPermitida -> exit 99', sinAllow.code === undefined ? sinAllow === 99 : sinAllow === 99, 'exit=' + sinAllow);

  const tmpOk = path.join(RAIZ, MARCA + '-encerrado');
  const cfgOk = `{ marca:'${MARCA}', appdata:${JSON.stringify(ad)}, permitirAusente:true, raizPermitida:${JSON.stringify(tmpOk)}, prohibido:[], vigilarBdViva:false }`;
  const dentro = hijoConSegura(cfgOk, path.join(tmpOk, 'x'));
  comp('AUSENTE + raizPermitida: dentro -> permitida', dentro.code === 0, 'exit=' + dentro.code);
  const fuera = hijoConSegura(cfgOk, path.join(RAIZ, MARCA + '-otro'));
  comp('AUSENTE + raizPermitida: fuera de la raiz -> exit 99', fuera.code === 99, 'exit=' + fuera.code);
}

// -- dentroDe(): semantica de Windows --------------------------------------
{
  comp('dentroDe padre==hijo', G.dentroDe('C:\\a\\b', 'C:\\a\\b'));
  comp('dentroDe hijo real', G.dentroDe('C:\\a\\b\\c', 'C:\\a\\b'));
  comp('dentroDe hermana con prefijo', !G.dentroDe('C:\\a\\bb', 'C:\\a\\b'));
  comp('dentroDe padre no es hijo', !G.dentroDe('C:\\a', 'C:\\a\\b'));
  comp('dentroDe otra unidad', !G.dentroDe('D:\\a\\b\\c', 'C:\\a\\b'));
  comp('dentroDe mayusculas', G.dentroDe('c:\\A\\B\\c', 'C:\\a\\b'));
  comp('dentroDe separadores mezclados', G.dentroDe('C:/a/b/c', 'C:\\a\\b'));
  comp('dentroDe travesia con ..', !G.dentroDe('C:\\a\\b\\..\\..\\z', 'C:\\a\\b'));
}

// -- la vigilancia de la BD viva ------------------------------------------
{
  const real = path.join(RAIZ, 'bd-vigilada');
  fs.mkdirSync(real, { recursive: true });
  fs.writeFileSync(path.join(real, 'panorama.sqlite3'), 'contenido original');
  const ad = appdataCon('bdviva', JSON.stringify({ userDataDir: real }));
  const g = G.crearGuardia({ marca: MARCA, appdata: ad, prohibido: [], silencioso: true, vigilarBdViva: false });
  const nBytes = Buffer.byteLength('contenido original');
  comp('BD viva: huella inicial leida', g.BD_ANTES.estado === 'ok' && g.BD_ANTES.bytes === nBytes, JSON.stringify(g.BD_ANTES));
  comp('BD viva: apunta a <ubicacion real>/panorama.sqlite3',
    g.rutaBdViva() === path.join(real, 'panorama.sqlite3'), g.rutaBdViva());
  comp('BD viva: sin cambios -> igual', g.compararBdViva().igual === true);
  fs.writeFileSync(path.join(real, 'panorama.sqlite3'), 'contenido MODIFICADO');
  comp('BD viva: tras modificarla -> detectado', g.compararBdViva().igual === false);

  // y el hook de salida lo convierte en exit 98
  const f = path.join(RAIZ, 'hijo-bd.js');
  fs.writeFileSync(f,
    "const fs=require('fs'),path=require('path');\n" +
    "const G=require(" + JSON.stringify(path.join(__dirname, 'guardia-rutas.js')) + ");\n" +
    "const g=G.crearGuardia({marca:'" + MARCA + "',appdata:" + JSON.stringify(ad) + ",prohibido:[],silencioso:true});\n" +
    "fs.writeFileSync(path.join(" + JSON.stringify(real) + ",'panorama.sqlite3'),'TOCADA POR LA PRUEBA');\n", 'utf8');
  let code = 0;
  try { execFileSync(process.execPath, [f], { stdio: 'pipe', env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }) }); }
  catch (e) { code = e.status; }
  comp('BD viva: tocarla durante la prueba -> exit 98', code === 98, 'exit=' + code);
}

console.log('');
console.log(`  RESULTADO: ${ok} OK / ${mal} FALLOS`);
fs.rmSync(RAIZ, { recursive: true, force: true });
process.exit(mal === 0 ? 0 : 1);
