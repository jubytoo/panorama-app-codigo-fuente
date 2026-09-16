'use strict';
// Sustituye la seccion CV de test-borrados.js por una que ejecuta el HTML
// PRODUCTIVO tal cual, sin parches simulados: ahora el cambio de §4.9 ya esta
// en el archivo real.
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'bloque5', 'test-borrados.js');
let t = fs.readFileSync(F, 'utf8');

const INI = "  seccion('CV — flujo REAL saveState(true) -> doSaveNow() -> contrato');";
const FIN = "  // =========================================================================\n  seccion('RESIDUOS Y PRODUCCION');";
const i = t.indexOf(INI);
const j = t.indexOf(FIN);
if (i < 0 || j < 0 || j <= i) throw new Error('no se localiza la seccion CV');

const NUEVA = String.raw`  seccion('CV — D4a/D4b sobre el HTML PRODUCTIVO (sin parches)');
  // =========================================================================
  {
    const HTML = fsReal.readFileSync(path.join(PROJ, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'), 'utf8');
    const srcSave = extraerDe(HTML, 'function saveState(immediate)');
    const srcDo = extraerDe(HTML, 'async function doSaveNow()');

    // 1) §4.9 esta EN PRODUCCION, y en sus DOS mitades.
    ok('CV produccion: saveState(true) propaga el resultado',
      /if \(immediate\) return doSaveNow\(\);/.test(srcSave) && !/if \(immediate\) \{ doSaveNow\(\); return; \}/.test(srcSave));
    ok('CV produccion: saveState con la sesion detenida devuelve contrato, no undefined',
      /if \(guardadosDetenidos\) return Promise\.resolve\(CONTRATO_SESION_DETENIDA\);/.test(srcSave));
    ok('CV produccion: doSaveNow devuelve el contrato en TODAS sus ramas',
      /if \(guardadosDetenidos\) return CONTRATO_SESION_DETENIDA;/.test(srcDo) &&
      /return res \|\| CONTRATO_RESPUESTA_VACIA;/.test(srcDo) &&
      (srcDo.split('return res;').length - 1) === 2 &&
      /catch \(e\) \{[\s\S]*return \{ ok: false, aplicado: false, reintentable: true/.test(srcDo),
      JSON.stringify({ returnRes: srcDo.split('return res;').length - 1 }));
    ok('CV produccion: main.js ya NO borra el CV viejo al elegir uno nuevo',
      !/\.filter\(\(f\) => f\.startsWith\(evalId \+ '__'\)\)/.test(fsReal.readFileSync(path.join(PROJ, 'main.js'), 'utf8')));
    ok('CV produccion: el nombre del CV nuevo lleva nonce ademas del reloj',
      /storedName = ` + '`' + String.raw`\$\{evalId\}__\$\{Date\.now\(\)\}_\$\{crypto\.randomBytes\(8\)\.toString\('hex'\)\}\$\{ext\}` + '`' + String.raw`/
        .test(fsReal.readFileSync(path.join(PROJ, 'main.js'), 'utf8')));

    // 2) se monta el codigo REAL: constantes + saveState + doSaveNow del HTML.
    const constsCv = ['CONTRATO_SESION_DETENIDA', 'CONTRATO_RESPUESTA_VACIA'].map((n) => {
      const a = HTML.indexOf('const ' + n + ' = Object.freeze({');
      if (a < 0) throw new Error('NO SE ENCONTRO la constante ' + n);
      return HTML.slice(a, HTML.indexOf('});', a) + 3) + '\n';
    }).join('');

    // 3) y los DOS manejadores REALES de CV, recortados del propio HTML.
    function ramaDeHtml(desde, hasta) {
      const a = HTML.indexOf(desde);
      if (a < 0) throw new Error('NO SE ENCONTRO la rama: ' + desde);
      const b = HTML.indexOf(hasta, a);
      if (b < 0) throw new Error('NO SE ENCONTRO el final de la rama: ' + hasta);
      return HTML.slice(a + desde.length, b);
    }
    const RAMA_QUITAR = ramaDeHtml("} else if (action === 'quitar-cv') {", "\n  } else if (action === 'toggle-tasks')");
    const RAMA_ADJUNTAR = ramaDeHtml("} else if (action === 'adjuntar-cv' || action === 'cambiar-cv') {", "\n  } else if (action === 'ver-cv')");
    ok('CV las dos ramas reales se recortan del HTML productivo',
      RAMA_QUITAR.indexOf('removeCandidateCv') > 0 && RAMA_ADJUNTAR.indexOf('pickCandidateCv') > 0,
      JSON.stringify({ quitar: RAMA_QUITAR.length, adjuntar: RAMA_ADJUNTAR.length }));

    // Deja que se asienten las promesas: todo el flujo es microtareas.
    async function asentar() {
      for (let k = 0; k < 20; k++) await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      for (let k = 0; k < 20; k++) await Promise.resolve();
    }

    function montarCv(respuesta, opciones) {
      const o = opciones || {};
      const est = { toasts: [], errores: [], avisosPersistentes: [], alerts: [], quitados: [], confirmado: null };
      const cuerpo = constsCv + '\n' +
        'let saveTimer = null; let guardadosDetenidos = false; let avisoReinicioMostrado = false;\n' +
        "const AVISO_SESION_DETENIDA = 'sesion detenida';\n" +
        srcSave + '\n' + srcDo + '\n' +
        'function mutacionesPermitidas() { return !guardadosDetenidos; }\n' +
        'async function quitarCvReal(t) {' + RAMA_QUITAR + '}\n' +
        'async function adjuntarCvReal(t) {' + RAMA_ADJUNTAR + '}\n' +
        'return { saveState, doSaveNow, mutacionesPermitidas, quitarCvReal, adjuntarCvReal,\n' +
        '         detenidos: () => guardadosDetenidos };';
      const f = new Function('window', 'showToast', 'showError', 'mostrarAvisoPersistente', 'psAlert',
        'clearTimeout', 'setTimeout', 'state', 'askConfirm', 'renderEvaluaciones', 'showModalCv', cuerpo);
      const api = f(
        {
          panoramaBridge: {
            saveCandidateEvalData: () => Promise.resolve(respuesta()),
            removeCandidateCv: (s) => { est.quitados.push(s); if (o.alQuitar) o.alQuitar(s); return Promise.resolve({ ok: true }); },
            pickCandidateCv: () => Promise.resolve(o.pick ? o.pick() : { ok: false, canceled: true }),
          },
        },
        (m) => est.toasts.push(m), (m) => est.errores.push(m),
        (m) => est.avisosPersistentes.push(m), (m) => { est.alerts.push(m); return Promise.resolve(); },
        () => {}, () => null, o.state || { puestos: [], evaluaciones: [] },
        // askConfirm(titulo, mensaje, cb): se captura la promesa del callback
        // para poder esperarla; el codigo real no la devuelve.
        (tit, msg, cb) => { est.confirmado = cb(); },
        () => { est.renders = (est.renders || 0) + 1; }, () => {});
      return { api, est };
    }

    // --- CV-RM-1/2/3: quitar CV, con la rama REAL --------------------------
    async function correrQuitar(respuesta, cvPath, ev) {
      const st = { puestos: [], evaluaciones: [ev] };
      const { api, est } = montarCv(respuesta, {
        state: st,
        alQuitar: () => { try { fsReal.unlinkSync(cvPath); } catch (e) {} },
      });
      await api.quitarCvReal({ dataset: { id: ev.id } });
      if (est.confirmado) await est.confirmado;
      await asentar();
      return { api, est };
    }
    {
      const d = carpeta('cv-rm1'); const cv = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(cv, 'CV', 'utf8');
      const ev = { id: 'e1', cvFileName: 'cv.pdf', cvStoredName: 'e1__1.pdf' };
      const { est } = await correrQuitar(() => ({ ok: false, aplicado: false, reintentable: true, error: 'no se pudo' }), cv, ev);
      ok('CV-RM-1 aplicado:false -> el estado vuelve a referenciar el CV y el archivo sigue',
        ev.cvStoredName === 'e1__1.pdf' && ev.cvFileName === 'cv.pdf' && fsReal.existsSync(cv) && est.quitados.length === 0,
        JSON.stringify({ ev, quitados: est.quitados }));
    }
    {
      const d = carpeta('cv-rm2'); const cv = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(cv, 'CV', 'utf8');
      const ev = { id: 'e1', cvFileName: 'cv.pdf', cvStoredName: 'e1__1.pdf' };
      const { api, est } = await correrQuitar(() => ({ ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'reinicia' }), cv, ev);
      ok('CV-RM-2 aplicado:true/verificado:false -> estado sin CV, el CV FISICO se conserva, sesion detenida',
        ev.cvStoredName === null && fsReal.existsSync(cv) && est.quitados.length === 0 &&
        api.detenidos() === true && est.avisosPersistentes.length === 1 && api.mutacionesPermitidas() === false,
        JSON.stringify({ ev, existe: fsReal.existsSync(cv), quitados: est.quitados, detenidos: api.detenidos() }));
    }
    {
      const d = carpeta('cv-rm3'); const cv = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(cv, 'CV', 'utf8');
      const ev = { id: 'e1', cvFileName: 'cv.pdf', cvStoredName: 'e1__1.pdf' };
      const { est } = await correrQuitar(() => ({ ok: true, aplicado: true, verificado: true }), cv, ev);
      ok('CV-RM-3 aplicado:true/verificado:true -> solo entonces desaparece el CV',
        ev.cvStoredName === null && !fsReal.existsSync(cv) && est.quitados.length === 1 && est.quitados[0] === 'e1__1.pdf',
        JSON.stringify({ ev, quitados: est.quitados, existe: fsReal.existsSync(cv) }));
    }

    // --- CV-REPLACE-1/2/3: cambiar CV, con la rama REAL --------------------
    async function correrCambiar(respuesta, viejo, nuevo, ev) {
      const st = { puestos: [], evaluaciones: [ev] };
      const mapa = { [path.basename(viejo)]: viejo, [path.basename(nuevo)]: nuevo };
      const { api, est } = montarCv(respuesta, {
        state: st,
        pick: () => ({ ok: true, fileName: 'nuevo.pdf', storedName: path.basename(nuevo) }),
        alQuitar: (s) => { try { fsReal.unlinkSync(mapa[s]); } catch (e) {} },
      });
      await api.adjuntarCvReal({ dataset: { id: ev.id } });
      await asentar();
      return { api, est };
    }
    {
      const d = carpeta('cv-rep1');
      const v = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(v, 'VIEJO', 'utf8');
      const n = path.join(d, 'e1__2.pdf'); fsReal.writeFileSync(n, 'NUEVO', 'utf8');
      const ev = { id: 'e1', cvFileName: 'v.pdf', cvStoredName: 'e1__1.pdf' };
      const { est } = await correrCambiar(() => ({ ok: false, aplicado: false, reintentable: true, error: 'x' }), v, n, ev);
      ok('CV-REPLACE-1 aplicado:false -> vuelve al CV viejo, el viejo intacto, el nuevo se retira',
        ev.cvStoredName === 'e1__1.pdf' && fsReal.existsSync(v) && !fsReal.existsSync(n) &&
        est.quitados.length === 1 && est.quitados[0] === 'e1__2.pdf',
        JSON.stringify({ ev, quitados: est.quitados, viejo: fsReal.existsSync(v), nuevo: fsReal.existsSync(n) }));
    }
    {
      const d = carpeta('cv-rep2');
      const v = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(v, 'VIEJO', 'utf8');
      const n = path.join(d, 'e1__2.pdf'); fsReal.writeFileSync(n, 'NUEVO', 'utf8');
      const ev = { id: 'e1', cvFileName: 'v.pdf', cvStoredName: 'e1__1.pdf' };
      const { api, est } = await correrCambiar(() => ({ ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'reinicia' }), v, n, ev);
      ok('CV-REPLACE-2 aplicado:true/verificado:false -> quedan LOS DOS, nada se destruye, reiniciar',
        fsReal.existsSync(v) && fsReal.existsSync(n) && est.quitados.length === 0 &&
        api.detenidos() === true && est.avisosPersistentes.length === 1 && ev.cvStoredName === 'e1__2.pdf',
        JSON.stringify({ quitados: est.quitados, v: fsReal.existsSync(v), n: fsReal.existsSync(n), det: api.detenidos() }));
    }
    {
      const d = carpeta('cv-rep3');
      const v = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(v, 'VIEJO', 'utf8');
      const n = path.join(d, 'e1__2.pdf'); fsReal.writeFileSync(n, 'NUEVO', 'utf8');
      const ev = { id: 'e1', cvFileName: 'v.pdf', cvStoredName: 'e1__1.pdf' };
      const { est } = await correrCambiar(() => ({ ok: true, aplicado: true, verificado: true }), v, n, ev);
      ok('CV-REPLACE-3 aplicado:true/verificado:true -> ahora si se retira el viejo',
        !fsReal.existsSync(v) && fsReal.existsSync(n) && ev.cvStoredName === 'e1__2.pdf' &&
        est.quitados.length === 1 && est.quitados[0] === 'e1__1.pdf',
        JSON.stringify({ ev, quitados: est.quitados }));
    }

    // --- la propagacion en si ---------------------------------------------
    {
      const { api } = montarCv(() => ({ ok: true, aplicado: true, verificado: true }));
      const p = api.saveState(true);
      ok('CV saveState(true) devuelve una promesa (propaga el contrato)', p && typeof p.then === 'function');
      const r = await p;
      ok('CV saveState(true) resuelve al CONTRATO real de doSaveNow(), no a undefined',
        !!r && r.aplicado === true && r.verificado === true, JSON.stringify(r));
      const { api: api2 } = montarCv(() => ({ ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'x' }));
      await api2.saveState(true);
      const r2 = await api2.saveState(true);
      ok('CV con la sesion detenida saveState(true) sigue devolviendo contrato (aplicado:false)',
        !!r2 && r2.aplicado === false && r2.reintentable === false, JSON.stringify(r2));
    }
  }

`;

t = t.slice(0, i) + NUEVA + t.slice(j);
fs.writeFileSync(F, t, 'utf8');
console.log('  seccion CV reemplazada. nuevo tamano: ' + t.length + ' bytes');
