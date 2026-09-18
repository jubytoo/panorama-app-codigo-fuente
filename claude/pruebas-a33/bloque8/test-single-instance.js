'use strict';
// ---------------------------------------------------------------------------
// Block 8B — SONDA DE MECANISMO: alcance real de app.requestSingleInstanceLock()
// en este Electron (30.5.1), en sandbox, con electron.exe desnudo (sin
// main.js del producto, sin Drive, sin BD real, sin Run/tarea). Ver
// sonda-single-instance.js y sonda-userdata-defecto.js para el detalle.
//
// Formaliza como batería con ok()/fallos los tres experimentos hechos a mano
// durante el diagnóstico: mismo dominio bloquea, dominio distinto no
// bloquea, dominio por defecto real (esta cuenta Windows) bloquea.
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const EP = path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe');
const SONDA = path.join(__dirname, 'sonda-single-instance.js');
const SONDA_DEFECTO = path.join(__dirname, 'sonda-userdata-defecto.js');

let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }

const RAIZ = path.join(os.tmpdir(), '_a33-b8b-single-instance');
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

function lanzar(args) {
  return new Promise((resolve) => {
    const p = spawn(EP, args, { windowsHide: true });
    p.on('exit', () => resolve());
    p.on('error', () => resolve());
  });
}
function leer(out) {
  try { return JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { return null; }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ===========================================================================
  seccion('SI-0. EL OVERRIDE DE APPDATA POR VARIABLE DE ENTORNO NO CAMBIA LA RUTA POR DEFECTO');
  // ===========================================================================
  {
    // Confirma por qué NO se puede fabricar "otro usuario de Windows" a base
    // de variables de entorno (ARN-3 aplicado aquí): hace falta app.setPath()
    // explícito para cambiar de verdad el dominio.
    const out = path.join(RAIZ, 'defecto.json');
    const sandbox = path.join(RAIZ, 'appdata-fake');
    fs.mkdirSync(path.join(sandbox, 'Roaming'), { recursive: true });
    await lanzar([SONDA_DEFECTO, '--out=' + out]);
    const r = leer(out);
    ok('SI-0 la sonda arrancó y escribió su resultado', !!r, JSON.stringify(r));
    if (r) {
      ok('SI-0 userData resuelto NO es el de sandbox (Electron ignora el override de env)',
        !r.userData.startsWith(sandbox), JSON.stringify(r));
    }
  }

  // ===========================================================================
  seccion('SI-1. MISMO DOMINIO (userData explícito) -> el segundo proceso NO consigue el cerrojo');
  // ===========================================================================
  {
    const SB1 = path.join(RAIZ, 'SB1');
    const out1 = path.join(RAIZ, 'p1.json');
    const out2 = path.join(RAIZ, 'p2.json');
    const marca = path.join(RAIZ, 'p1.second-instance-recibido.txt');
    fs.rmSync(marca, { force: true });
    const p1 = spawn(EP, [SONDA, '--datadir=' + SB1, '--out=' + out1, '--hold=6000'], { windowsHide: true });
    await esperar(1500);
    await lanzar([SONDA, '--datadir=' + SB1, '--out=' + out2, '--hold=500']);
    await esperar(500);
    const r1 = leer(out1), r2 = leer(out2);
    ok('SI-1 P1 (primero) consigue el cerrojo', r1 && r1.gotLock === true, JSON.stringify(r1));
    ok('SI-1 P2 (mismo dominio, segundo, con P1 vivo) NO consigue el cerrojo', r2 && r2.gotLock === false, JSON.stringify(r2));
    ok('SI-1 P1 recibe el evento second-instance', fs.existsSync(marca));
    await new Promise((res) => { if (p1.exitCode !== null) return res(); p1.on('exit', res); setTimeout(res, 8000); });
  }

  // ===========================================================================
  seccion('SI-2. DOMINIO DISTINTO (userData explícito distinto) -> ambos consiguen el cerrojo a la vez');
  // ===========================================================================
  {
    const SB1 = path.join(RAIZ, 'SB1b');
    const SB2 = path.join(RAIZ, 'SB2b');
    const out3 = path.join(RAIZ, 'p3.json');
    const out4 = path.join(RAIZ, 'p4.json');
    const p3 = spawn(EP, [SONDA, '--datadir=' + SB1, '--out=' + out3, '--hold=4000'], { windowsHide: true });
    await esperar(1500);
    const p4 = spawn(EP, [SONDA, '--datadir=' + SB2, '--out=' + out4, '--hold=4000'], { windowsHide: true });
    await esperar(1500);
    const r3 = leer(out3), r4 = leer(out4);
    ok('SI-2 P3 (dominio SB1) consigue el cerrojo', r3 && r3.gotLock === true, JSON.stringify(r3));
    ok('SI-2 P4 (dominio SB2, distinto, lanzado con P3 vivo) TAMBIÉN lo consigue', r4 && r4.gotLock === true, JSON.stringify(r4));
    ok('SI-2 ambos siguen vivos a la vez en ese instante (sin arbitraje entre dominios)',
      p3.exitCode === null && p4.exitCode === null);
    await Promise.all([
      new Promise((res) => { if (p3.exitCode !== null) return res(); p3.on('exit', res); setTimeout(res, 6000); }),
      new Promise((res) => { if (p4.exitCode !== null) return res(); p4.on('exit', res); setTimeout(res, 6000); }),
    ]);
  }

  // ===========================================================================
  seccion('SI-3. userData POR DEFECTO REAL (sin setPath, esta cuenta de Windows) -> el segundo NO consigue el cerrojo');
  // ===========================================================================
  {
    const out5 = path.join(RAIZ, 'p5.json');
    const out6 = path.join(RAIZ, 'p6.json');
    const marca = path.join(RAIZ, 'p5.second-instance-recibido.txt');
    fs.rmSync(marca, { force: true });
    const p5 = spawn(EP, [SONDA, '--out=' + out5, '--hold=6000'], { windowsHide: true });
    await esperar(1500);
    await lanzar([SONDA, '--out=' + out6, '--hold=500']);
    await esperar(500);
    const r5 = leer(out5), r6 = leer(out6);
    ok('SI-3 P5 (userData por defecto real, primero) consigue el cerrojo', r5 && r5.gotLock === true, JSON.stringify(r5));
    ok('SI-3 P6 (mismo userData por defecto, segundo, con P5 vivo) NO lo consigue', r6 && r6.gotLock === false, JSON.stringify(r6));
    ok('SI-3 P5 recibe el evento second-instance', fs.existsSync(marca));
    await new Promise((res) => { if (p5.exitCode !== null) return res(); p5.on('exit', res); setTimeout(res, 8000); });
    // Limpieza del directorio genérico "Electron" que crea esta sonda por
    // defecto en la cuenta real de Windows (no es dato de Panorama).
    try {
      const generico = path.join(os.homedir(), 'AppData', 'Roaming', 'Electron');
      fs.rmSync(generico, { recursive: true, force: true });
    } catch (e) { /* no crítico */ }
  }

  console.log('\n======================================================================');
  console.log(`  SINGLE-INSTANCE: ${pass} OK / ${fail} FALLOS`);
  console.log('======================================================================');
  fs.rmSync(RAIZ, { recursive: true, force: true });
  if (fail) process.exitCode = 1;
})();
