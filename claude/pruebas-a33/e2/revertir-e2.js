'use strict';
// ---------------------------------------------------------------------------
// Reversiones de E2, sobre los archivos PRODUCTIVOS.
//
//   P-dashboard-local : el dashboard vuelve a calcular por su cuenta, con la
//                       logica ANTERIOR (sin el fix de `serviceStart` futuro).
//                       La bateria debe volver a ver divergencia en C11/C15/C18.
//   Q-regex-portfolio : `portfolio:summary` vuelve a sacar los dias con una
//                       regex sobre el MENSAJE. El desacoplamiento se pierde.
//
// Se relanzan con PANORAMA_DASHBOARD / PANORAMA_MAIN apuntando a la copia.
// Una prueba que tambien pasa contra el codigo anterior no demuestra nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = path.join(PROJ, 'main.js');
const DASH = path.join(PROJ, 'dashboard', 'plantilla_dashboard.html');

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES DE E2');
let malos = 0;

// --- P: el dashboard vuelve a su copia local, con la logica vieja ---------
{
  const SRC = fs.readFileSync(DASH, 'utf8');
  const de = `function computeServiceEndWarningLocal(today){
  return PanoramaServiceStatus.serviceStatus(state, today);
}`;
  // Exactamente lo que habia antes de E2: sin `serviceStart`, sin `kind`, sin
  // `days`. Es la copia divergente que producia el conflicto con el lanzador.
  const a = `function computeServiceEndWarningLocal(today){
  // (E2 revertida a proposito: copia local con la logica ANTERIOR)
  const RANK = { amarillo:1, rojo:2 };
  let best = null;
  function consider(level, message){ if(!best || RANK[level] > RANK[best.level]) best = { level, message }; }
  if(state.serviceEnd){
    const end = new Date(state.serviceEnd+'T00:00:00');
    const diffDays = Math.round((end-today)/86400000);
    if(diffDays < 0){
      const [y,m,d] = state.serviceEnd.split('-');
      consider('rojo', \`Finalizó el \${d}/\${m}/\${y}\`);
    }
    else if(diffDays <= 30) consider('amarillo', \`Servicio finaliza en \${diffDays} día\${diffDays===1?'':'s'}\`);
  }
  if(state.prorrogaEstimada && state.prorrogaEstimada.fecha && !state.enProrroga){
    const estEnd = new Date(state.prorrogaEstimada.fecha+'T00:00:00');
    const diffEst = Math.round((estEnd-today)/86400000);
    if(diffEst < 0) consider('rojo', \`Prórroga estimada sin confirmar (venció hace \${Math.abs(diffEst)} día\${Math.abs(diffEst)===1?'':'s'})\`);
    else if(diffEst <= 30) consider('amarillo', \`Prórroga estimada sin confirmar — quedan \${diffEst} día\${diffEst===1?'':'s'}\`);
  }
  return best;
}`;
  const veces = SRC.split(de).length - 1;
  if (veces !== 1) { malos++; console.log(`  [NO SE PUDO] P-dashboard-local: el fragmento aparece ${veces} veces`); }
  else {
    const destino = path.join(dirOut, 'P-dashboard-local.html');
    fs.writeFileSync(destino, SRC.replace(de, a), 'utf8');
    console.log('  [LISTA] P-dashboard-local');
    console.log('          el dashboard vuelve a calcular por su cuenta, sin el fix de serviceStart');
    console.log('          deberia romper: E2-A4, E2-A6/A7 y la identidad de C10/C11/C15/C18/C21');
    console.log('          copia: ' + destino);
  }
}

// --- Q: portfolio:summary vuelve a parsear el texto -----------------------
{
  const SRC = fs.readFileSync(MAIN, 'utf8');
  const de = `      const days = r.serviceStatusDays;
      if (typeof days === 'number' && Number.isFinite(days) && days >= 0) {`;
  const a = `      const daysMatch = /(\\d+)/.exec(r.serviceEndMessage || '');   // (E2 revertida a proposito)
      const days = daysMatch ? Number(daysMatch[1]) : null;
      if (days !== null) {`;
  const veces = SRC.split(de).length - 1;
  if (veces !== 1) { malos++; console.log(`  [NO SE PUDO] Q-regex-portfolio: el fragmento aparece ${veces} veces`); }
  else {
    const destino = path.join(dirOut, 'Q-regex-portfolio.js');
    fs.writeFileSync(destino, SRC.replace(de, a), 'utf8');
    console.log('  [LISTA] Q-regex-portfolio');
    console.log('          el timeline vuelve a sacar los dias del MENSAJE con una regex');
    console.log('          deberia romper: E2-E1, E2-E2 y E2-E3');
    console.log('          copia: ' + destino);
  }
}

process.exit(malos === 0 ? 0 : 1);
