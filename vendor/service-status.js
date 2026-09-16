// ---------------------------------------------------------------------------
// E2 (15 sept 2026) — FUENTE ÚNICA DE VERDAD del estado temporal de un
// servicio: si todavía no ha arrancado, si está a punto de terminar, si ya
// terminó, y lo mismo para una prórroga estimada sin confirmar.
//
// POR QUÉ EXISTE. Esta lógica estaba DUPLICADA en dos sitios —
// `computeServiceEndWarning()` en main.js (para las tarjetas del lanzador) y
// `computeServiceEndWarningLocal()` en dashboard/plantilla_dashboard.html (para
// el aviso del propio proyecto)— y las dos copias YA HABÍAN DIVERGIDO: el fix
// de v2.0.52 (un servicio que aún no ha empezado avisa «Arranca en N días» y
// eso tiene prioridad sobre cualquier aviso de fin) entró solo en main.js.
// Resultado medible, con el MISMO proyecto delante:
//
//     lanzador:  «Arranca en 3 días»
//     dashboard: «Servicio finaliza en 20 días»
//
// El motivo que se dio en su día para duplicarla —«no se puede compartir código
// literal entre el proceso principal y esta plantilla»— era cierto para
// `vendor/theme.js`, que usa `document`. Esta función es JS puro: ni DOM, ni
// Electron, ni `require` de nada. Así que sí se puede compartir, y se comparte.
//
// CÓMO SE CARGA (patrón ya existente, no hay infraestructura nueva):
//   - main.js:    require('./vendor/service-status.js')
//   - dashboard:  <script src="../vendor/service-status.js"></script>, y
//                 `fixVendorScriptPaths()` reescribe esa ruta relativa a una
//                 `file://` absoluta al hornear `projects/<id>/dashboard.html`
//                 — exactamente igual que ya hace con xlsx, pptxgen, theme.js,
//                 fonts.css y motion.css.
//
// CONTRATO. Devuelve `null` (no hay nada que avisar) o:
//
//   {
//     kind:    'proximo-inicio' | 'finalizado' | 'finaliza-pronto'
//            | 'prorroga-vencida' | 'prorroga-pronto',
//     level:   'proximo-inicio' | 'rojo' | 'amarillo',
//     days:    entero CON SIGNO,
//     message: el texto para el usuario
//   }
//
// SEMÁNTICA DE `days` — explícita a propósito, porque un número suelto llamado
// «días» es justo la clase de dato que se malinterpreta.
//
//   `days` son los días que faltan DESDE HOY HASTA LA FECHA QUE DA NOMBRE AL
//   `kind`. Positivo = en el futuro. Cero = hoy. NEGATIVO = ya pasó.
//
//   | kind              | `days` cuenta hasta            | signo    |
//   |-------------------|--------------------------------|----------|
//   | proximo-inicio    | `serviceStart`                 | > 0      |
//   | finaliza-pronto   | `serviceEnd`                   | 0 … 30   |
//   | finalizado        | `serviceEnd`                   | < 0      |
//   | prorroga-pronto   | `prorrogaEstimada.fecha`       | 0 … 30   |
//   | prorroga-vencida  | `prorrogaEstimada.fecha`       | < 0      |
//
//   NO es «días de servicio restantes» ni «días transcurridos»: en
//   `proximo-inicio` cuenta hasta el INICIO, no hasta el fin. Por eso al
//   proyectarlo sobre `projects:list` se llama `serviceStatusDays` y NO
//   `serviceEndDays`, que sería falso justo en ese caso.
//
//   Los estados vencidos llevan `days` negativo, no su magnitud: así el signo
//   basta para saber si algo ya pasó, sin mirar el `kind`. El texto de
//   `prorroga-vencida` sí dice «venció hace N días» en positivo — eso es
//   presentación, y sale de `Math.abs(days)`.
//
// EL TEXTO ES PRESENTACIÓN. `message` se conserva palabra por palabra como lo
// escribía `main.js`, pero NADIE debe volver a derivar lógica de él: para eso
// están `kind`, `level` y `days`. (Hasta esta ronda, `portfolio:summary` sacaba
// los días con una regex `/(\d+)/` sobre el mensaje; con «Finalizó el
// 09/12/2026» eso habría leído «09» como si fueran 9 días.)
// ---------------------------------------------------------------------------
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PanoramaServiceStatus = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UMBRAL_AVISO_DIAS = 30;   // mismo umbral de siempre, ver nota de main.js
  var MS_DIA = 86400000;

  // Las fechas del estado son cadenas 'aaaa-mm-dd' (el propio <input type=date>).
  // Se les añade la hora a las 00:00 locales para que la resta no dependa de la
  // zona horaria ni de la hora a la que se mire.
  function aDia(iso) {
    if (!iso) return null;
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  function diffDias(hasta, hoy) {
    return Math.round((hasta - hoy) / MS_DIA);
  }
  function plural(n) { return n === 1 ? '' : 's'; }

  // `today` puede venir con la hora del reloj: se normaliza a medianoche, que
  // es lo que hacían las dos copias (una con setHours, la otra construyendo la
  // fecha). Un `today` inválido produce diferencias NaN y, por tanto, `null`:
  // mismo resultado que tenían las dos implementaciones anteriores.
  function normalizarHoy(today) {
    var t = (today instanceof Date) ? today : new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function serviceStatus(state, today) {
    var st = state || {};
    var hoy = normalizarHoy(today);

    // v2.0.52 — PRIORIDAD ABSOLUTA. Antes de que el servicio arranque, «finaliza
    // en X días» (o «activo» a secas) es confuso o directamente falso: lo único
    // relevante es cuánto falta para el inicio. Este `return` temprano es la
    // razón de ser del caso, y es justo lo que le faltaba al dashboard.
    var inicio = aDia(st.serviceStart);
    if (inicio) {
      var diffInicio = diffDias(inicio, hoy);
      if (diffInicio > 0) {
        return {
          kind: 'proximo-inicio',
          level: 'proximo-inicio',
          days: diffInicio,
          message: 'Arranca en ' + diffInicio + ' día' + plural(diffInicio),
        };
      }
    }

    // De los dos avisos posibles (fin de servicio y prórroga estimada sin
    // confirmar) se queda el MÁS GRAVE.
    var RANK = { amarillo: 1, rojo: 2 };
    var best = null;
    function consider(kind, level, days, message) {
      if (!best || RANK[level] > RANK[best.level]) {
        best = { kind: kind, level: level, days: days, message: message };
      }
    }

    var fin = aDia(st.serviceEnd);
    if (fin) {
      var diffFin = diffDias(fin, hoy);
      if (diffFin < 0) {
        // v2.0.53 — fecha concreta, no relativa: «que no ponga finalizó hace 9
        // días, debe poner finalizó el 09/12/2026». Se reordena la cadena
        // 'aaaa-mm-dd' a mano, sin pasar por toLocaleDateString, para no
        // depender de la configuración regional de la máquina.
        var p = String(st.serviceEnd).split('-');
        consider('finalizado', 'rojo', diffFin, 'Finalizó el ' + p[2] + '/' + p[1] + '/' + p[0]);
      } else if (diffFin <= UMBRAL_AVISO_DIAS) {
        consider('finaliza-pronto', 'amarillo', diffFin,
          'Servicio finaliza en ' + diffFin + ' día' + plural(diffFin));
      }
    }

    if (st.prorrogaEstimada && st.prorrogaEstimada.fecha && !st.enProrroga) {
      var estimada = aDia(st.prorrogaEstimada.fecha);
      if (estimada) {
        var diffEst = diffDias(estimada, hoy);
        if (diffEst < 0) {
          var venc = Math.abs(diffEst);
          consider('prorroga-vencida', 'rojo', diffEst,
            'Prórroga estimada sin confirmar (venció hace ' + venc + ' día' + plural(venc) + ')');
        } else if (diffEst <= UMBRAL_AVISO_DIAS) {
          consider('prorroga-pronto', 'amarillo', diffEst,
            'Prórroga estimada sin confirmar — quedan ' + diffEst + ' día' + plural(diffEst));
        }
      }
    }

    return best;
  }

  return { serviceStatus: serviceStatus, UMBRAL_AVISO_DIAS: UMBRAL_AVISO_DIAS };
}));
