'use strict';
// ---------------------------------------------------------------------------
// Las funciones del BLOQUE 5 que viven en main.js, en UNA sola lista.
//
// `ejecutarAccionDeArchivo()` y `destinoOcupadoPorOtroEquipo()` ahora dependen
// de ellas (dominio de ocupacion comun + puerta F-1), asi que cualquier arnes
// que extraiga el Bloque 4 tiene que extraer tambien esto. Si esta lista se
// queda corta, el arnes revienta con "X is not defined" — a proposito: es
// preferible a probar una version recortada de main.js.
// ---------------------------------------------------------------------------
const BLOQUES_B5 = [
  'function borradosDir()',
  'function journalBorradoPath(actionId)',
  'function cuarentenaDe(actionId, i)',
  'function estaDentroDe(hijo, padre)',
  'function mismaRuta(a, b)',
  'function slugDeProyectoPuro(row)',
  'function rutaBackupsPura(row)',
  'function rutaDashboardPura(projectId)',
  'function leerJournalBorrado(ruta)',
  'function journalsDeBorrados()',
  'function recursosReservados()',
  'function cubreRecurso(r, ruta)',
  'function conflictoRecurso(r, ambito)',
  'function ocupacionComun(destino, opts)',
  'function f1Borrados()',
  'function f1Global()',
  'function resumirDirectorio(dir)',
  'function existeRuta(p)',
  'function reponerRecurso(r)',
  'function reponerTodo(j)',
  'function purgarTodo(j)',
  'async function vaciarParticionDe(j)',
  'async function finalizarPurga(j)',
  'async function ejecutarBorrado(opts)',
  'async function resolverBorradoPendiente(j)',
  'async function recuperarBorradosPendientes()',
  'function proyectoBloqueadoPorBorrado(projectId)',
  'async function purgarBackupsAntiguos(projectId, dirBackups)',
  'function slugify(',
  // --- A2 bajo A3.3 -------------------------------------------------------
  // El cableado del restore metio la BARRERA UNIFICADA en los canales de
  // escritura, en deleteProjectById y en openProjectWindow, y la precondicion
  // de restauracion pendiente en el rekey. Cualquier arnes que extraiga esas
  // funciones necesita tambien estas, o revienta con "X is not defined".
  'function proyectoEnRestauracion(projectId)',
  'function proyectoBloqueadoParaMutar(projectId)',
  'function restauracionesDir()',
  'function dirDeRestauracion(actionId)',
  'function journalRestauracionPath(actionId)',
  'function previoPath(actionId)',
  'function materialDeRestauracionPendiente()',
  'function rekeyPuedeEmpezar()',
  // --- H-1 (15 sept 2026) --------------------------------------------------
  // `proyectoBloqueadoParaMutar()` ya no mira solo los dos Set en memoria:
  // pregunta tambien por el journal durable de `.panorama-restauraciones`. Eso
  // arrastra al ambito de CUALQUIER arnes que extraiga esa funcion —o sea, los
  // de los bloques 3, 4 y 5 tambien, no solo los de A2— el lector del journal
  // de restauracion. Sin estas tres, la barrera revienta con
  // "restauracionPendienteDeProyecto is not defined" en cuanto un arnes
  // intenta un backup:save.
  'function leerJournalRestauracion(ruta)',
  'function journalsDeRestauraciones()',
  'function restauracionPendienteDeProyecto(projectId)',
  // Y `f1Global()` incorpora la parte no discriminable de las restauraciones,
  // asi que arrastra tambien a `f1Restauraciones()`. Sin esta, cualquier
  // borrado revienta con "f1Restauraciones is not defined".
  'function f1Restauraciones()',
  // --- B3 (15 sept 2026) ---------------------------------------------------
  // B3 saco de `catch {}` vacio la limpieza de journals resueltos y el soltado
  // de la exclusiva: ahora pasan por dos helpers con rastro. Eso los mete en
  // el ambito de TODO arnes que extraiga ejecutarAccionDeArchivo,
  // ejecutarBorrado, resolverBorradoPendiente o rekeyAllUserFiles — que son
  // los bloques 3, 4, 5 y A2. Sin estas tres, el arnes revienta con
  // "borrarJournalResuelto is not defined" en cuanto se ejecuta la limpieza.
  //
  // No cambian el protocolo: siguen siendo best-effort y siguen sin lanzar.
  // Lo unico que anaden es una linea en app.log —que en el arnes es el doble
  // `appLog` que ya se le pasa como parametro— la primera vez por sesion.
  'function appLogUnaVezPorSesion(clave, linea)',
  'function motivoSinRutas(e)',
  'function borrarJournalResuelto(ruta, que)',
  'function soltarExclusivaConRastro(token, que)',
  // F3 (17 sept 2026): la politica de apertura/navegacion de ventanas. Entra
  // aqui porque `writeLocalStorageDumpToPartition` y `runInPartition` —que
  // extraen A2, el Bloque 5 y C1— la llaman al crear su ventana oculta. Sin
  // esto, esos arneses revientan con "aplicarPoliticaDeNavegacion is not
  // defined", que es exactamente lo que avisa la cabecera de este archivo.
  'function urlExternaPermitida(url)',
  'function urlParaRastro(u)',
  'function abrirEnNavegador(u, origen)',
  'function navegacionInternaLegitima(destino, actual)',
  'function aplicarPoliticaDeNavegacion(wc, etiqueta)',
];

const CONSTS_B5 = [
  "const BORRADOS_DIR_NAME = '.panorama-borrados';",
  'const BORRADOS_JOURNAL_V =',
  'const BORRADOS_TIPOS =',
  // P24: `leerJournalBorrado()` la consulta ahora para aceptar `recursos:[]` con
  // `sinRecursos:true` (solo tipos cuyo contrato permite cero recursos).
  'const BORRADOS_TIPOS_SIN_RECURSOS =',
  'const BACKUP_KEEP =',
  "const RESTAURACIONES_DIR_NAME = '.panorama-restauraciones';",
  // H-1: las necesita `leerJournalRestauracion()`, que ahora entra en el ambito
  // de todos los arneses. Los de A2 ya las declaraban por su cuenta;
  // `sinRepetir()` se encarga de que no salgan dos veces.
  'const RESTAURACIONES_JOURNAL_V =',
  'const RESTAURACION_FASES =',
  'const RESTAURACION_SIN_RESOLVER_MSG =',
  'const esHex =',
  'const esEnteroNoNegativo =',
];

// Lo que hay que declarar a mano en el ambito del arnes (en main.js son
// variables de modulo, no funciones, asi que no se pueden "extraer").
const PREAMBULO_B5 =
  'const proyectosEnBorrado = new Set();\n' +
  'const proyectosEnRestauracion = new Set();\n' +
  // H-1: el subconjunto "sin resolver". En main.js es otra variable de modulo.
  'const restauracionesSinResolver = new Set();\n' +
  'const restoreInProgress = proyectosEnRestauracion;\n' +
  // B3: el dedupe de avisos. En main.js es otra variable de modulo, asi que
  // tampoco se puede "extraer" — se declara aqui, igual que los Set de arriba.
  'const avisosYaRegistrados = new Set();\n';

// Parametros extra que necesita el ambito: `session` lo usa vaciarParticionDe.
const PARAMS_B5 = ['session'];

// Algunos arneses ya declaraban por su cuenta alguna de estas constantes
// (BACKUP_KEEP, por ejemplo). Declararla dos veces en el mismo ambito es un
// SyntaxError, asi que la lista final se deduplica por texto exacto.
function sinRepetir(lineas) {
  const vistas = new Set();
  return lineas.filter((l) => {
    const k = String(l).trim();
    if (!k || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

module.exports = { BLOQUES_B5, CONSTS_B5, PREAMBULO_B5, PARAMS_B5, sinRepetir };
