'use strict';
// ---------------------------------------------------------------------------
// Reversiones sobre el plantilla_dashboard.html PRODUCTIVO.
// Genera una copia con UNA proteccion de P12 quitada, para relanzar la bateria
// con PANORAMA_DASHBOARD apuntando a esa copia.
//
// Una prueba que tambien pasa contra el codigo anterior no demuestra nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const ORIG = process.env.PANORAMA_DASHBOARD_ORIG || path.join(PROJ, 'dashboard', 'plantilla_dashboard.html');
const SRC = fs.readFileSync(ORIG, 'utf8');

const REVERSIONES = [
  {
    // LA PRINCIPAL. `pctOf` vuelve a dividir sin mirar el rango: reaparecen el
    // NaN del proyecto nuevo Y el 100% falso del rango cero, que son las dos
    // manifestaciones del mismo defecto.
    id: 'M-sin-guarda-rango',
    espera: 'P12-1, P12-3, P12-3b/c/d y toda la seccion P12-C',
    desc: 'pctOf vuelve a dividir por (end-start) sin comprobar que haya rango',
    de: `function pctOf(dateObj, start, end){
  if(!rangoTemporalValido(start, end)) return 0;
  const p = clamp((dateObj-start)/(end-start),0,1)*100;
  return Number.isFinite(p) ? p : 0;
}`,
    a: `function pctOf(dateObj, start, end){
  // (guarda de rango revertida a proposito)
  return clamp((dateObj-start)/(end-start),0,1)*100;
}`,
  },
  {
    // La otra mitad: aunque pctOf devuelva 0, pintar el marcador de HOY en el
    // origen AFIRMA que hoy es el comienzo de un servicio que no tiene fechas.
    id: 'N-hoy-sin-rango',
    espera: 'P12-1/B, P12-3/B, P12-3b/B, P12-3c/B y P12-3d/B (el marcador HOY)',
    desc: 'el marcador de HOY vuelve a dibujarse aunque no haya escala temporal',
    de: `  if(rangoOk && (!isWindowed || (todayMidnight >= start && todayMidnight <= end))){`,
    a: `  if(!isWindowed || (todayMidnight >= start && todayMidnight <= end)){`,
  },
  {
    // Y la tercera: los dias saneados "por su cuenta" en vez de atados al
    // mismo rango. Quita el NaN y deja la mentira ("dia 258 de ~0").
    id: 'O-dias-sueltos',
    espera: 'P12-C7 y P12-C8',
    desc: 'daysElapsed/totalDays dejan de depender del rango y se calculan siempre',
    de: `  const daysElapsed = rangoOk ? Math.round((today-start)/86400000) : 0;
  const totalDays = rangoOk ? Math.round((end-start)/86400000) : 0;`,
    a: `  const daysElapsed = Math.round((today-start)/86400000);
  const totalDays = Math.round((end-start)/86400000);`,
  },
];

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES SOBRE plantilla_dashboard.html');
console.log('  origen: ' + ORIG);
let malos = 0;
for (const r of REVERSIONES) {
  const veces = SRC.split(r.de).length - 1;
  if (veces !== 1) { malos++; console.log(`  [NO SE PUDO] ${r.id}: el fragmento aparece ${veces} veces`); continue; }
  const destino = path.join(dirOut, r.id + '.html');
  fs.writeFileSync(destino, SRC.replace(r.de, r.a), 'utf8');
  console.log(`  [LISTA] ${r.id}`);
  console.log(`          ${r.desc}`);
  console.log(`          deberia romper: ${r.espera}`);
  console.log(`          copia: ${destino}`);
}
process.exit(malos === 0 ? 0 : 1);
