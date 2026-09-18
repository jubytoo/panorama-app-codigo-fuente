'use strict';
// ---------------------------------------------------------------------------
// Block 8A / P23 — REVERSIONES. Cada familia deshace UNA decisión del
// saneamiento del guardián y anuncia qué aserciones de test-8a-guardian.js
// tiene que tumbar (y solo esas). Escribe las copias en
// `8a/revertidos/<familia>/main.js`. NO toca producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SALIDA = path.join(__dirname, 'revertidos');
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');

function cambiar(src, busca, pone, veces) {
  const n = src.split(busca).length - 1;
  if (n === 0) throw new Error('NO SE ENCONTRO: ' + busca.slice(0, 80));
  if (veces !== undefined && n !== veces) throw new Error(`se esperaban ${veces} apariciones y hay ${n}: ${busca.slice(0, 60)}`);
  return src.split(busca).join(pone);
}

const BLOQUE_P23 = `  } else if (shouldBeOn && isOn) {
    // P23 (18 sept 2026): aquí \`isDriveSyncGuardActuallyAlive()\` ya dio
    // \`true\` — pero ni \`enabled.flag\` ni \`heartbeat.txt\` llevan identidad
    // de instalación (medido: un guardián vivo de OTRA instalación deja
    // pasar esta rama igual que el propio). Se comprueba además si Run y
    // la tarea corresponden de verdad a ESTA instalación. Política D2: si
    // no corresponden, se repara la persistencia y se lanza ADEMÁS el
    // guardián de esta instalación — nunca se toca ni se intenta terminar
    // el proceso que ya estuviera vivo (no hay forma de demostrar su
    // origen, y matarlo no está autorizado). Riesgo residual conocido y
    // NO resuelto por este cambio: un guardián vivo de las versiones
    // 0.1.60–0.1.69 puede tener el bug de WM_QUERYENDSESSION (ver
    // DriveSyncGuard.ps1, comentario v0.1.70) — este cambio no lo
    // neutraliza, solo dejar de confiar ciegamente en Run/tarea.
    // Ajuste final (18 sept 2026): esta inspección concreta (Run/tarea, dos
    // procesos externos síncronos) se cachea con un timestamp simple — NO
    // afecta a las ramas de arriba (activar/desactivar/heartbeat muerto),
    // que se evalúan en cada tick exactamente igual que antes. Run/tarea no
    // cambian solos durante una sesión ya en marcha (ver comentario junto a
    // DRIVE_SYNC_GUARD_PERSISTENCE_RECHECK_MS), así que espaciar esta
    // comprobación no renuncia a la autorreparación, solo a pagar su coste
    // en cada watchdog de 45s.
    if (Date.now() - ultimaInspeccionPersistenciaMs >= DRIVE_SYNC_GUARD_PERSISTENCE_RECHECK_MS) {
      ultimaInspeccionPersistenciaMs = Date.now();
      const persistencia = estadoPersistenciaDriveSyncGuard();
      if (persistencia === 'incorrecta') {
        appLog('Aviso — Run/tarea de la protección de apagado no corresponden a esta instalación (P23); reparando y lanzando esta copia, sin tocar el proceso ya vivo.');
        repararPersistenciaDriveSyncGuard('P23: Run/tarea no correspondían a esta instalación', (ok) => {
          if (ok) lanzarDriveSyncGuardActual('P23: persistencia reparada con guardián existente vivo');
        });
      } else if (persistencia === 'no-verificable') {
        // Ante duda no se lanza una copia adicional (podría acabar
        // disparándose en cada arranque/tick del watchdog ante un fallo
        // transitorio de reg.exe/schtasks.exe) — pero reparar es idempotente
        // y ya es la misma operación en la que se apoya el resto del
        // mecanismo, así que hacerlo también aquí es más seguro que no
        // tocar nada.
        appLog('Aviso — no se pudo verificar si Run/tarea de la protección de apagado corresponden a esta instalación; se reparan por prudencia, sin lanzar otra copia.');
        repararPersistenciaDriveSyncGuard('P23: persistencia no verificable, reparación preventiva');
      }
    }
  }
}`;

const FAMILIAS = [
  {
    id: 'M1-sin-comprobar-vivo',
    que: 'se quita por completo la comprobación de persistencia con el guardián vivo (vuelve al comportamiento previo a P23)',
    // También caen 8A-15/16/17 (no-verificable de las tres formas nuevas: sin
    // la rama entera no se repara nada) y 8A-18/8A-20 (sin la rama entera
    // nunca se consulta nada, ni de inmediato ni tras el intervalo). 8A-19
    // NO cae: "no vuelve a consultar" sigue siendo cierto de forma trivial
    // si no se consulta nunca. 8A-21 NO cae: la rama de heartbeat muerto es
    // otra, ajena a esta.
    tumba: [/^8A-3 /, /^8A-4 /, /^8A-5 /, /^8A-6 /, /^8A-7 /, /^8A-8 /, /^8A-9 /, /^8A-10 /, /^8A-15 /, /^8A-16 /, /^8A-17 /, /^8A-18 /, /^8A-20 /],
    hacer: () => cambiar(MAIN, BLOQUE_P23, '  }\n}', 1),
  },
  {
    id: 'M2-repara-no-lanza',
    que: 'ante persistencia incorrecta, se repara pero NO se lanza el guardián actual (rompe D2)',
    // Ajuste final: 8A-6/8A-7 pasaron a ser casos de status 1 -> no-verificable
    // (no de "incorrecta"), así que esta reversión concreta ya NO los toca;
    // los sigue tumbando R3 (que sí revierte semántica de status===1).
    tumba: [/^8A-3 /, /^8A-4 /, /^8A-5 /, /^8A-10 /],
    hacer: () => cambiar(MAIN,
      `        repararPersistenciaDriveSyncGuard('P23: Run/tarea no correspondían a esta instalación', (ok) => {
          if (ok) lanzarDriveSyncGuardActual('P23: persistencia reparada con guardián existente vivo');
        });`,
      `        repararPersistenciaDriveSyncGuard('P23: Run/tarea no correspondían a esta instalación', (ok) => {
          // REVERSIÓN M2: no lanza (rompe D2 a propósito)
        });`, 1),
  },
  {
    id: 'M3-lanza-no-verificable',
    que: 'ante persistencia no-verificable, se lanza igualmente (rompe el caso conservador)',
    // Ajuste final: 8A-6/8A-7 (status 1 ambiguo) también son casos
    // no-verificable ahora -- caen aquí igual que 8A-8/9/15/16/17.
    tumba: [/^8A-6 /, /^8A-7 /, /^8A-8 /, /^8A-9 /, /^8A-15 /, /^8A-16 /, /^8A-17 /],
    hacer: () => cambiar(MAIN,
      `        appLog('Aviso — no se pudo verificar si Run/tarea de la protección de apagado corresponden a esta instalación; se reparan por prudencia, sin lanzar otra copia.');
        repararPersistenciaDriveSyncGuard('P23: persistencia no verificable, reparación preventiva');`,
      `        appLog('Aviso — no se pudo verificar si Run/tarea de la protección de apagado corresponden a esta instalación; se reparan por prudencia, sin lanzar otra copia.');
        repararPersistenciaDriveSyncGuard('P23: persistencia no verificable, reparación preventiva', (ok) => {
          // REVERSIÓN M3: lanza igualmente aunque no sea verificable (a propósito, para tumbar el caso conservador)
          if (ok) lanzarDriveSyncGuardActual('REVERSION M3');
        });`, 1),
  },
  {
    id: 'M4-ignora-tarea',
    que: 'estadoPersistenciaDriveSyncGuard() ignora el estado de la tarea, solo mira Run',
    // Ajuste final: 8A-7 (tarea "ausente") pasó a ser un caso no-verificable,
    // y el chequeo de no-verificable (primera línea de la función, sin
    // tocar) ya corta ANTES de llegar a la línea que M4 muta -- deja de ser
    // un discriminador válido para esta propiedad. 8A-4 (tarea vieja,
    // incorrecta de verdad, no un error) sigue demostrando la propiedad rota.
    tumba: [/^8A-4 /],
    hacer: () => cambiar(MAIN,
      `  if (run.estado === 'correcta' && tarea.estado === 'correcta') return 'correcta';`,
      `  if (run.estado === 'correcta') return 'correcta'; // REVERSIÓN M4: se ignora el estado de la tarea`, 1),
  },
  {
    id: 'R1-re-consulta-cada-tick',
    que: 'ajuste final: se deshabilita la cadencia -- vuelve a inspeccionar Run/tarea en cada tick, cada 45s',
    tumba: [/^8A-19 /],
    hacer: () => cambiar(MAIN,
      `    if (Date.now() - ultimaInspeccionPersistenciaMs >= DRIVE_SYNC_GUARD_PERSISTENCE_RECHECK_MS) {
      ultimaInspeccionPersistenciaMs = Date.now();
      const persistencia = estadoPersistenciaDriveSyncGuard();`,
      `    if (true) { // REVERSIÓN R1: cadencia deshabilitada, se reinspecciona siempre
      const persistencia = estadoPersistenciaDriveSyncGuard();`, 1),
  },
  {
    id: 'R2-sin-timeout',
    que: 'ajuste final: se quita timeout/killSignal de las dos consultas externas (reg.exe/schtasks.exe pueden volver a colgarse indefinidamente)',
    tumba: [/^8A-1 las dos consultas/],
    hacer: () => cambiar(MAIN,
      `{ windowsHide: true, encoding: 'utf8', timeout: DRIVE_SYNC_GUARD_INSPECCION_TIMEOUT_MS, killSignal: 'SIGKILL' }`,
      `{ windowsHide: true, encoding: 'utf8' }`, 2),
  },
  {
    id: 'R3-status1-es-ausente',
    que: 'ajuste final: se restaura status===1 => "ausente" (vuelve a interpretar un exit code genérico como ausencia demostrada)',
    tumba: [/^8A-6 /, /^8A-7 /],
    hacer: () => cambiar(MAIN,
      `  } catch (e) {
    return { estado: 'no-verificable', motivo: String((e && e.message) || e) };
  }`,
      `  } catch (e) {
    if (e && e.status === 1) return { estado: 'ausente' }; // REVERSIÓN R3
    return { estado: 'no-verificable', motivo: String((e && e.message) || e) };
  }`, 2),
  },
  {
    id: 'R4-heartbeat-respeta-cadencia-lenta',
    que: 'ajuste final: la recuperación por heartbeat muerto deja de ser inmediata y espera la misma cadencia lenta que Run/tarea (rompe la recuperación inmediata del guardián caído)',
    tumba: [/^8A-21 /],
    hacer: () => cambiar(MAIN,
      `    enableDriveSyncGuardSilently('proceso sin señales de vida recientes, relanzando');
  } else if (shouldBeOn && isOn) {`,
      `    if (Date.now() - ultimaInspeccionPersistenciaMs >= DRIVE_SYNC_GUARD_PERSISTENCE_RECHECK_MS) { // REVERSIÓN R4: respeta la cadencia lenta
      enableDriveSyncGuardSilently('proceso sin señales de vida recientes, relanzando');
    }
  } else if (shouldBeOn && isOn) {`, 1),
  },
];

if (require.main === module) {
  fs.rmSync(SALIDA, { recursive: true, force: true });
  console.log('REVERSIONES BLOCK 8A / P23');
  console.log('  origen: ' + path.join(PROJ, 'main.js'));
  for (const fam of FAMILIAS) {
    const src = fam.hacer();
    if (src === MAIN) throw new Error('la reversión no cambia nada: ' + fam.id);
    const dir = path.join(SALIDA, fam.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'main.js'), src, 'utf8');
    console.log(`  [LISTA] ${fam.id}`);
    console.log(`          ${fam.que}`);
    console.log(`          debería romper: ${fam.tumba.map(String).join(' ')}`);
    console.log(`          copia: ${path.join(dir, 'main.js')}`);
  }
}

module.exports = { FAMILIAS, SALIDA };
