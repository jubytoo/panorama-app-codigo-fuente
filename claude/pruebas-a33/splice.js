'use strict';
const fs = require('fs');
const F = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\a3-3-diseno.md';
const SB = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\';

const L = fs.readFileSync(F, 'utf8').split(/\r?\n/);
const nuevo = fs.readFileSync(SB + 'bloque-pruebas.txt', 'utf8').replace(/\s+$/, '').split('\n');

const ini = L.findIndex((l) => l.includes('Camino rápido, precedencia, encadenado y durabilidad'));
const fin = L.findIndex((l) => l.startsWith('## 12.'));
if (ini < 0 || fin < 0) { console.log('NO ENCONTRADO ini=' + ini + ' fin=' + fin); process.exit(1); }
// el bloque va desde ini hasta la linea "---" que precede a "## 12."
let corte = fin;
while (corte > ini && L[corte - 1].trim() === '') corte--;
if (L[corte - 1].trim() === '---') corte--;      // dejar el --- fuera
while (corte > ini && L[corte - 1].trim() === '') corte--;

console.log('sustituyendo lineas ' + (ini + 1) + '..' + corte + ' (' + (corte - ini) + ' lineas) por ' + nuevo.length);
console.log('  primera vieja: ' + L[ini]);
console.log('  ultima  vieja: ' + L[corte - 1]);

const salida = L.slice(0, ini).concat(nuevo, [''], L.slice(corte));
fs.writeFileSync(F, salida.join('\n'), 'utf8');
console.log('OK, total ' + salida.length + ' lineas');
