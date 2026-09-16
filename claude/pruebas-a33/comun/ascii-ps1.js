'use strict';
// PowerShell 5.1 lee los .ps1 como ANSI: cualquier caracter no-ASCII escrito en
// UTF-8 llega como mojibake y puede romper el PARSEO (un guion largo dentro de
// una cadena basta). Este script deja el .ps1 en ASCII puro.
const fs = require('fs');
const path = require('path');

const F = process.argv.slice(2).filter((a) => a.endsWith('.ps1'));
if (!F.length) { console.error('uso: ascii-ps1.js <archivo.ps1> ...'); process.exit(2); }

const MAPA = [
  [/[—–]/g, '-'],      // guiones largos
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, '...'],
  [/[áàä]/g, 'a'], [/[éèë]/g, 'e'], [/[íìï]/g, 'i'], [/[óòö]/g, 'o'], [/[úùü]/g, 'u'],
  [/[ÁÀÄ]/g, 'A'], [/[ÉÈË]/g, 'E'], [/[ÍÌÏ]/g, 'I'], [/[ÓÒÖ]/g, 'O'], [/[ÚÙÜ]/g, 'U'],
  [/ñ/g, 'n'], [/Ñ/g, 'N'], [/[¿¡]/g, ''], [/[✓✗]/g, ''],
  [/·/g, '|'],             // punto medio, usado como separador
  [/º/g, 'o'], [/ª/g, 'a'],
];

for (const f of F) {
  let t = fs.readFileSync(f, 'utf8');
  const antes = (t.match(/[^\x00-\x7F]/g) || []).length;
  for (const [re, s] of MAPA) t = t.replace(re, s);
  const restantes = t.match(/[^\x00-\x7F]/g) || [];
  if (restantes.length) {
    console.error(`  ${path.basename(f)}: quedan ${restantes.length} no-ASCII: ${[...new Set(restantes)].join(' ')}`);
    process.exit(1);
  }
  fs.writeFileSync(f, t, 'ascii');
  console.log(`  ${path.basename(f)}: ${antes} caracteres no-ASCII convertidos; ahora ASCII puro`);
}
