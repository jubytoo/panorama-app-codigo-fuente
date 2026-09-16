// v2.0.27 — Tema visual GLOBAL de toda la aplicación (antes era un ajuste
// por proyecto: cada Dashboard/Directorio guardaba su propio state.theme en
// su propia partición de localStorage, así que dos proyectos podían verse
// con temas distintos entre sí, y las otras 5 ventanas de la app
// (Preparación de Reunión, Evaluación de Candidatos, Proyectos/launcher,
// "Restaurar un backup concreto", Seguridad) no tenían tema ninguno).
//
// Este archivo es la ÚNICA fuente de los 5 temas — antes el objeto THEMES y
// la función applyTheme() estaban duplicados palabra por palabra en
// dashboard/plantilla_dashboard.html y directorio/plantilla_directorio.html;
// ahora viven aquí una sola vez y las 7 ventanas cargan este script.
//
// El ajuste elegido (una de las 5 claves de abajo) se guarda en main.js vía
// getMeta/setMeta bajo la clave 'app_theme' (misma tabla app_meta que el
// resto de preferencias persistentes) — ver theme:get / theme:set en
// main.js. Cada ventana lo lee al arrancar (window.themeAPI.get()) y se
// suscribe a los cambios en caliente (window.themeAPI.onChanged(cb)) para
// que si cambias el tema con varias ventanas abiertas, todas se actualicen
// solas sin tener que cerrarlas.
//
// Los primeros 4 temas (medianoche/nube/cielo/niebla) son EXACTAMENTE los
// mismos que ya existían en el panel "⚙ Apariencia" de Dashboard/Directorio
// desde hace tiempo — ni un valor de color ha cambiado. El 5º tema
// ("Marfil") es nuevo: recoge tal cual la paleta que ya tenía Evaluación de
// Candidatos (azul/blanco, la única ventana con look propio, distinto del
// resto) para que quien la prefiera pueda tenerla en toda la app, no solo
// ahí.
//
// Cada tema trae dos grupos de variables:
//  - las "de base" (bg/surface/ink/cyan/...), que ya usaban las 7 ventanas
//    con estos mismos nombres (confirmado leyendo cada plantilla antes de
//    escribir esto — todas comparten el mismo esquema salvo Evaluación de
//    Candidatos).
//  - los "alias de Evaluación de Candidatos" (navy/teal/violet/bgPage/...),
//    los nombres de variable propios que usa ESA plantilla en concreto. Se
//    aplican también desde aquí para no tener que reescribir cientos de
//    reglas CSS de ese archivo con los nombres nuevos — así participa del
//    mismo selector de tema que el resto sin tocar su hoja de estilos.
// v2.0.36: se añaden semNaranja/semAmarillo/semAmarilloClaro a cada tema.
// Antes vivían como variables propias hardcodeadas en el :root de
// launcher/index.html (--sem-naranja/--sem-amarillo/--sem-amarillo-claro,
// usadas para el borde izquierdo "semáforo" de urgencia de las tarjetas
// del lanzador y para el texto de sus avisos — "Servicio finaliza en N
// días", entrevista pendiente) y NUNCA se reasignaban al cambiar de tema
// — quedaban siempre con sus valores originales, afinados para el fondo
// casi negro de Medianoche (pálidos, poco saturados). En Medianoche eso
// se ve bien (confirmado por el usuario: "el unico premium es medianoche
// que esta perfecto"), pero en cualquiera de los 4 temas claros un texto
// amarillo pálido sobre fondo claro es casi ilegible — confirmado viendo
// la tarjeta "IMUS - INSTITUTO DE LAS MUJERES 6M" en Niebla y en Marfil:
// el aviso "Servicio finaliza en 4 días" se leía apenas, en el mismo tono
// pálido en las dos. Con esto entran en el sistema de temas: Medianoche
// mantiene exactamente sus valores de siempre (0 regresión), los otros 4
// reciben tonos ámbar/naranja oscuros con contraste real sobre fondo
// claro (familia #b45309/#d97706/#c2410c).
//
// v2.0.37: rediseño completo de los 4 temas claros ("son de pena todos
// menos medianoche" -- Medianoche NO se toca, ni un valor). Antes los 4
// compartían casi la misma paleta (variaciones muy sutiles de un mismo
// azul apagado) y encima dos de ellos (Nube/Marfil) usaban tarjeta blanca
// sobre fondo blanco/casi blanco -- cero profundidad, cero identidad
// propia por tema, de ahí la sensación de "apagado". Cada tema recibe
// ahora un COLOR DE ACENTO PRINCIPAL distinto y con cuerpo (no un azul
// grisáceo desaturado), más un fondo de página con un ligero tinte del
// mismo tono (nunca blanco puro) para que las tarjetas SÍ destaquen sobre
// el fondo -- mismo patrón de "capas" que ya usa Medianoche (bg más
// oscuro que surface) y que usan apps con temas cuidados (Linear, Stripe,
// Notion): página con tinte sutil, tarjeta clara encima, bloques de
// estado (chips de riesgo/hitos/KPI) con wash de color más presente y
// texto saturado, no lavado. Identidad de cada tema:
//   - Nube:   azul eléctrico (#2554E8) -- limpio, profesional.
//   - Cielo:  verde-azulado/teal (#0A7A70) -- fresco, distinto del azul.
//   - Niebla: índigo/violeta (#5A4FE5) -- el tono "de marca" con más
//             carácter, apropiado para el nombre (bruma violeta).
//   - Marfil: azul marino (#1E3A6E) sobre fondo marfil cálido --
//             identidad "editorial/premium" distinta del resto, ya no un
//             azul genérico repetido.
// Las variables --sem-* (semáforo de urgencia) y --amber/--amber-dark
// (aviso/pendiente en pills y KPIs) se mantienen COMPARTIDAS entre los 4
// temas claros a propósito: son colores SEMÁNTICOS (urgencia/aviso), no
// de marca, y deben leerse igual pase lo que pase con el tema activo --
// solo cambia el acento principal (--cyan y sus alias navy/teal) y el
// fondo/superficie de cada tema.
//
// v2.0.39: los 4 temas claros seguían viéndose "poco premium" tras el
// rediseño de 2.0.37 pese a tener ya un acento propio por tema -- motivo
// concreto, visto en capturas reales del usuario: `surface` (el color de
// fondo de CADA TARJETA/bloque: `.panel`, `.stat`, `.card` del lanzador,
// etc.) seguía siendo BLANCO PURO (#FFFFFF) en los 4, con `bg` (el fondo
// de PÁGINA) apenas un par de puntos de luminancia por debajo -- así que,
// aunque cada tema tiene su propio azul/teal/índigo/marino de acento, el
// 95% de la superficie visible (todas las tarjetas) seguía siendo blanco
// liso, indistinguible entre temas a simple vista. Ahora `surface` es un
// color SÓLIDO Y CLARO del tono de cada tema (no blanco, no un tinte casi
// imperceptible) y `surface2` (usado en KPIs, inputs, filas de hover) un
// escalón más saturado todavía -- capas de color reales, no solo un
// acento aislado sobre blanco. Bug real encontrado de paso: `--green` y
// `--red` (las variables de TEXTO, distintas de `--green-bg`/`--red-bg`)
// nunca las tocaba applyTheme() -- se quedaban fijas en los valores de
// Medianoche (#4caf82/#e2596b, afinados para SU fondo casi negro) en los
// 4 temas claros también, dando un verde/rojo apagados sobre fondo claro.
// Ahora cada tema define su propio `green`/`red` (Medianoche mantiene
// exactamente sus valores de siempre, 0 regresión).
// Todos los pares texto/fondo relevantes (ink/inkSoft/inkFaint contra
// bg/surface/surface2, verde/rojo/ámbar contra su chip, texto del botón
// contra --cyan, y el propio --border contra --surface, este último bajo
// el umbral real de WCAG 1.4.11 "non-text contrast" de 3:1 para que el
// borde de una tarjeta se note sobre su propio fondo) se midieron con la
// fórmula de contraste relativo WCAG -- ver el detalle exacto en
// `claude/panorama-app-project-context.md`, entrada 2.0.39. Donde hacía
// falta elegir entre "tarjeta más saturada" y "acento --cyan legible
// como texto sobre la tarjeta" (usado en varias plantillas como color de
// texto plano, no solo de fondo de botón), se oscureció el --cyan un
// poco en vez de aclarar la tarjeta -- un ajuste pequeño (Nube L52.7%->
// 49.7%, Cielo L25.9%->24.9%, Niebla L60.4%->55.4%; Marfil no necesitó
// tocarse) que mantiene la identidad de cada tema y de paso hace el
// acento un pelín más rico/saturado en vez de diluir el color de las
// tarjetas, que era justo lo que se pedía arreglar.
// v2.0.44: navyInk/tealInk/redTxInk -- Evaluación de Candidatos vuelve a
// participar del tema global (2.0.27 lo intentó, 2.0.28 lo revirtió por
// petición expresa del usuario: "queda horroroso con el oscuro que tengo").
// Causa real del fallo de 2.0.27 (no una impresión): esa plantilla pinta
// cabecera/pestaña activa/botones/tabla con FONDO SÓLIDO en --navy/--teal/
// --red-tx y TEXTO BLANCO fijo encima -- funciona en los 4 temas claros
// (ahí navy/teal/red-tx son colores oscuros/saturados, blanco contrasta
// bien) pero se rompe en Medianoche, donde esos mismos alias son acentos
// CLAROS pensados para resaltar sobre fondo oscuro (igual que --cyan) --
// texto blanco sobre un acento ya claro es casi ilegible. Mismo patrón que
// --cyan-ink (v2.0.37): un color de tinta POR TEMA para texto sobre estos
// fondos sólidos, no un blanco fijo. En los 4 temas claros es blanco (cero
// cambio respecto al diseño original); en Medianoche reutiliza el mismo
// tono oscuro que ya usa --cyan-ink para el mismo problema.
const THEMES = {
  medianoche: { label: 'Medianoche', dark: true,
    bg: '#0a0e13', surface: '#121821', surface2: '#171f2a', border: '#232e3a', borderSoft: '#1a2330',
    ink: '#eef2f6', inkSoft: '#93a3b5', inkFaint: '#546578',
    cyan: '#4fc3d9', cyanDim: '#1e3540', cyanBg: '#0f242b',
    redBg: '#2b1418', amberBg: '#2b2211', greenBg: '#102a20',
    glow1: '#10202b', glow2: '#1a1409',
    shadow: '0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.28)',
    navy: '#5B9FE8', navyDark: '#3D6FB0', teal: '#2DD4BF', tealDark: '#0F9C8E',
    violet: '#A78BFA', amber: '#f0a83c', amberDark: '#c9852a', greenTx: '#6fd9a6', redTx: '#f08a97',
    semNaranja: '#ff7a1a', semAmarillo: '#f0e6a0', semAmarilloClaro: '#faf5da',
    // v2.0.39: green/red nuevos -- IDÉNTICOS al --green/--red que ya
    // estaban hardcodeados en el :root de cada plantilla (0a0e13/121821
    // family), así que aplicar Medianoche no cambia ni un píxel.
    green: '#4caf82', red: '#e2596b',
    // v2.0.40: disc-*/red-border/amber-border nuevos -- mismo motivo que
    // green/red arriba (auditoría 2026-09-12: applyTheme() nunca los
    // tocaba, así que en los 4 temas claros se quedaban fijos en estos
    // mismos valores oscuros de todas formas). Aquí, en Medianoche, son
    // IDÉNTICOS a los que ya estaban hardcodeados en el :root de
    // directorio (discD/I/S/C) y en los bordes de .btn.danger/.confirm-bar/
    // .risk-detail-card.cont (redBorder/amberBorder) -- cero cambio visual.
    discD: '#e2596b', discDBg: '#2b1418', discI: '#e8c547', discIBg: '#2b2711',
    discS: '#4caf82', discSBg: '#102a20', discC: '#4a90c4', discCBg: '#0f1f2b',
    redBorder: '#4a2229', amberBorder: '#4a3315',
    cyanInk: '#06222a', navyInk: '#06222a', tealInk: '#06222a', redTxInk: '#06222a' },
  nube: { label: 'Nube', dark: false,
    // Identidad: azul eléctrico premium (Modern Minimalist / Stripe-Linear).
    // v2.0.39: surface deja de ser blanco puro -- ahora un azul sólido
    // claro (#C9D6F2) con capa más profunda en surface2 (#AFC3EE) y borde
    // con cuerpo (#346CE5, AA 1.4.11 contra surface). cyan oscurecido de
    // #2554E8 a #184AE5 (L 52.7%->49.7%) -- el mínimo necesario para que
    // el propio --cyan usado como color de TEXTO sobre la tarjeta nueva
    // (más saturada que el blanco de antes) siga en AA (4.57:1); como
    // fondo de botón sigue leyéndose igual de bien (blanco encima a
    // 6.67:1, antes 5.98:1 -- mejora, no empeora).
    bg: '#F0F3FA', surface: '#C9D6F2', surface2: '#AFC3EE', border: '#346CE5', borderSoft: '#87A4E3',
    ink: '#101B2D', inkSoft: '#3E4E68', inkFaint: '#5A6C86',
    cyan: '#184AE5', cyanDim: '#AEC4FA', cyanBg: '#E5EDFE',
    redBg: '#FCE1E6', amberBg: '#FCEACB', greenBg: '#DEF3E7',
    glow1: '#FFFFFF', glow2: '#FFFFFF',
    shadow: '0 1px 2px rgba(16,27,45,.08), 0 10px 24px rgba(16,27,45,.12)',
    navy: '#184AE5', navyDark: '#1B3FB8', teal: '#0D9488', tealDark: '#0B6E64',
    violet: '#6D4FA8', amber: '#8A5209', amberDark: '#6B3E07', greenTx: '#15803D', redTx: '#B91C1C',
    semNaranja: '#c2410c', semAmarillo: '#b45309', semAmarilloClaro: '#d97706',
    // v2.0.39: --green/--red propios (antes heredaban los de Medianoche
    // sin querer -- ver comentario de cabecera). #0F6B31/#B91C1C dan
    // AA >=5.7:1 contra greenBg/redBg de este tema.
    green: '#0F6B31', red: '#B91C1C',
    // v2.0.40: disc-* (insignias DISC de Directorio de Talento) y
    // red-border/amber-border (borde de .btn.danger/.confirm-bar/aviso de
    // prórroga) -- mismo bug que green/red de arriba, auditoría
    // 2026-09-12. D/I/S reutilizan red/amber/green (colores SEMÁNTICOS,
    // ya AA) de este mismo tema; C es un azul nuevo, compartido por los 4
    // temas claros igual que sem-naranja/sem-amarillo (7.55:1 sobre bg,
    // 5.75:1 sobre surface).
    discD: '#B91C1C', discDBg: '#FCE1E6', discI: '#8A5209', discIBg: '#FCEACB',
    discS: '#0F6B31', discSBg: '#DEF3E7', discC: '#1D4E89', discCBg: '#E3EEF8',
    redBorder: '#B91C1C', amberBorder: '#8A5209',
    cyanInk: '#FFFFFF', navyInk: '#FFFFFF', tealInk: '#FFFFFF', redTxInk: '#FFFFFF' },
  cielo: { label: 'Cielo', dark: false,
    // Identidad: verde-azulado/teal rico -- distinto del azul de Nube.
    // v2.0.37: cyan oscurecido de #0C8C82 a #0A7A70 tras medir contraste
    // real (texto blanco sobre el botón sólido daba 4.13:1, por debajo
    // del mínimo AA de texto normal 4.5:1; con #0A7A70 sube a 5.21:1).
    // v2.0.39: surface deja de ser blanco puro -- ahora teal sólido claro
    // (#CCF0EC), surface2 más profundo (#B2EBE5), borde con cuerpo
    // (#198F83). cyan oscurecido un pelín más, de #0A7A70 a #0A756C
    // (L 25.9%->24.9%, casi imperceptible) -- lo mínimo para que --cyan
    // como texto plano sobre la tarjeta nueva llegue a AA (4.57:1).
    bg: '#F1F9F8', surface: '#CCF0EC', surface2: '#B2EBE5', border: '#198F83', borderSoft: '#61D1C6',
    ink: '#0B2A2C', inkSoft: '#2E5153', inkFaint: '#4C7274',
    cyan: '#0A756C', cyanDim: '#9EDBD2', cyanBg: '#DDF4EF',
    redBg: '#FCE1E6', amberBg: '#FCEACB', greenBg: '#DBF3E4',
    glow1: '#FFFFFF', glow2: '#FFFFFF',
    shadow: '0 1px 2px rgba(11,42,44,.08), 0 10px 24px rgba(11,42,44,.14)',
    navy: '#0A756C', navyDark: '#085F58', teal: '#0A756C', tealDark: '#085F58',
    violet: '#6D4FA8', amber: '#8A5209', amberDark: '#6B3E07', greenTx: '#15803D', redTx: '#B91C1C',
    semNaranja: '#c2410c', semAmarillo: '#b45309', semAmarilloClaro: '#d97706',
    green: '#0F6B31', red: '#B91C1C',
    discD: '#B91C1C', discDBg: '#FCE1E6', discI: '#8A5209', discIBg: '#FCEACB',
    discS: '#0F6B31', discSBg: '#DBF3E4', discC: '#1D4E89', discCBg: '#E3EEF8',
    redBorder: '#B91C1C', amberBorder: '#8A5209',
    cyanInk: '#FFFFFF', navyInk: '#FFFFFF', tealInk: '#FFFFFF', redTxInk: '#FFFFFF' },
  niebla: { label: 'Niebla', dark: false,
    // Identidad: índigo/violeta con carácter (Linear-esque) -- el tono
    // "de marca" de los 4 claros, en vez del azul-gris apagado de antes.
    // v2.0.39: surface deja de ser blanco puro -- ahora índigo sólido
    // claro (#D0CBF1), surface2 más profundo (#B9B1EC), borde con cuerpo
    // (#4F38E0). cyan oscurecido de #5A4FE5 a #4539E2 (L 60.4%->55.4%,
    // el ajuste más grande de los 3 -- Niebla partía del cyan más claro)
    // -- mínimo necesario para AA (4.6:1) como texto sobre la tarjeta
    // nueva; de paso el acento queda más rico/saturado, no diluido.
    bg: '#F2F0F9', surface: '#D0CBF1', surface2: '#B9B1EC', border: '#4F38E0', borderSoft: '#968AE0',
    ink: '#211B36', inkSoft: '#463D5E', inkFaint: '#665D82',
    cyan: '#4539E2', cyanDim: '#C6BEF5', cyanBg: '#ECE8FD',
    redBg: '#FCE1E9', amberBg: '#FBEACC', greenBg: '#DEF0E3',
    glow1: '#FFFFFF', glow2: '#FFFFFF',
    shadow: '0 1px 2px rgba(33,27,54,.10), 0 10px 26px rgba(33,27,54,.16)',
    navy: '#4539E2', navyDark: '#4038B8', teal: '#0D8A7A', tealDark: '#0A6B5F',
    violet: '#7C3AED', amber: '#8A5209', amberDark: '#6B3E07', greenTx: '#15803D', redTx: '#B91C1C',
    semNaranja: '#c2410c', semAmarillo: '#b45309', semAmarilloClaro: '#d97706',
    green: '#0F6B31', red: '#B91C1C',
    discD: '#B91C1C', discDBg: '#FCE1E9', discI: '#8A5209', discIBg: '#FBEACC',
    discS: '#0F6B31', discSBg: '#DEF0E3', discC: '#1D4E89', discCBg: '#E3EEF8',
    redBorder: '#B91C1C', amberBorder: '#8A5209',
    cyanInk: '#FFFFFF', navyInk: '#FFFFFF', tealInk: '#FFFFFF', redTxInk: '#FFFFFF' },
  marfil: { label: 'Marfil', dark: false,
    // Identidad: azul marino + dorado sobre marfil cálido -- editorial/
    // premium, ya no el azul genérico que compartía con el resto. Deja de
    // ser "tal cual la paleta de Evaluación de Candidatos" (eso era lo
    // que la hacía indistinguible del resto): ver v2.0.37 en
    // panorama-app-project-context.md para el razonamiento completo.
    // Nota: --amber se mantiene IGUAL que en los otros 3 temas claros --
    // es un color SEMÁNTICO (aviso/pendiente en pills y KPIs, igual que
    // --sem-naranja), no de marca, así que no debe variar por tema.
    // v2.0.39: surface deja de ser blanco puro -- ahora crema/dorado
    // sólido (#EEE4CD), surface2 más profundo (#E8D9B5), borde con cuerpo
    // (#9C7721). --cyan (azul marino) NO se tocó -- ya daba 8.81:1 como
    // texto sobre la tarjeta nueva, de sobra en AA sin necesidad de
    // oscurecerlo.
    bg: '#F8F6F1', surface: '#EEE4CD', surface2: '#E8D9B5', border: '#9C7721', borderSoft: '#CFB16E',
    ink: '#1D2A3D', inkSoft: '#4C5A6D', inkFaint: '#6C7A8A',
    cyan: '#1E3A6E', cyanDim: '#A9BEDD', cyanBg: '#E7EDF6',
    redBg: '#FBE2DE', amberBg: '#F7E7C0', greenBg: '#E4F0DC',
    glow1: '#FFFFFF', glow2: '#FFFFFF',
    shadow: '0 1px 2px rgba(30,42,61,.08), 0 10px 24px rgba(30,42,61,.12)',
    navy: '#1E3A6E', navyDark: '#14294E', teal: '#0D9488', tealDark: '#0F766E',
    violet: '#7C3AED', amber: '#8A5209', amberDark: '#6B3E07', greenTx: '#15803D', redTx: '#B91C1C',
    semNaranja: '#c2410c', semAmarillo: '#b45309', semAmarilloClaro: '#d97706',
    green: '#0F6B31', red: '#B91C1C',
    discD: '#B91C1C', discDBg: '#FBE2DE', discI: '#8A5209', discIBg: '#F7E7C0',
    discS: '#0F6B31', discSBg: '#E4F0DC', discC: '#1D4E89', discCBg: '#E3EEF8',
    redBorder: '#B91C1C', amberBorder: '#8A5209',
    cyanInk: '#FFFDF5', navyInk: '#FFFDF5', tealInk: '#FFFDF5', redTxInk: '#FFFDF5' },
};

// Orden de presentación en el selector — no depende del orden de claves de
// THEMES (no garantizado en todos los motores JS para claves no numéricas,
// aunque en la práctica V8 sí lo respeta; se deja explícito para no fiarse).
const THEME_ORDER = ['medianoche', 'nube', 'cielo', 'niebla', 'marfil'];

function applyTheme(themeKey) {
  const t = THEMES[themeKey] || THEMES.medianoche;
  const r = document.documentElement.style;
  r.setProperty('--bg', t.bg);
  r.setProperty('--surface', t.surface);
  r.setProperty('--surface-2', t.surface2);
  r.setProperty('--border', t.border);
  r.setProperty('--border-soft', t.borderSoft);
  r.setProperty('--ink', t.ink);
  r.setProperty('--ink-soft', t.inkSoft);
  r.setProperty('--ink-faint', t.inkFaint);
  r.setProperty('--cyan', t.cyan);
  r.setProperty('--cyan-dim', t.cyanDim);
  r.setProperty('--cyan-bg', t.cyanBg);
  // v2.0.37: color de TEXTO sobre un botón con --cyan como fondo SÓLIDO
  // (ver launcher/index.html, security-window, password-prompt,
  // backup-picker: .btn{background:var(--cyan); color:var(--cyan-ink)}).
  // Antes ese texto era #06222a fijo -- daba por hecho que --cyan siempre
  // iba a ser un tono claro (cierto en Medianoche). Con temas nuevos donde
  // --cyan es un acento medio/oscuro (azul eléctrico, teal, índigo, azul
  // marino) un texto casi negro fijo quedaría casi ilegible sobre el
  // botón. Cada tema define su propio --cyan-ink con el contraste correcto.
  r.setProperty('--cyan-ink', t.cyanInk);
  // v2.0.44: mismo motivo que --cyan-ink, para las cabeceras/pestaña activa/
  // botones/tabla de Evaluación de Candidatos que usan --navy/--teal/--red-tx
  // como fondo SÓLIDO con texto encima -- ver comentario de cabecera de THEMES.
  r.setProperty('--navy-ink', t.navyInk);
  r.setProperty('--teal-ink', t.tealInk);
  r.setProperty('--red-tx-ink', t.redTxInk);
  r.setProperty('--red-bg', t.redBg);
  r.setProperty('--amber-bg', t.amberBg);
  r.setProperty('--green-bg', t.greenBg);
  r.setProperty('--bg-glow-1', t.glow1);
  r.setProperty('--bg-glow-2', t.glow2);
  r.setProperty('--shadow', t.shadow);
  // Alias propios de Evaluación de Candidatos (ver comentario de cabecera).
  r.setProperty('--navy', t.navy);
  r.setProperty('--navy-dark', t.navyDark);
  r.setProperty('--teal', t.teal);
  r.setProperty('--teal-dark', t.tealDark);
  r.setProperty('--violet', t.violet);
  r.setProperty('--amber', t.amber);
  r.setProperty('--amber-dark', t.amberDark);
  r.setProperty('--green-tx', t.greenTx);
  r.setProperty('--red-tx', t.redTx);
  // v2.0.39: --green/--red (color de TEXTO, distinto de --green-bg/--red-bg)
  // nunca se tocaban aquí -- se quedaban fijos en el valor hardcodeado del
  // :root de cada plantilla (el de Medianoche) en los 4 temas claros
  // también. Ver comentario de cabecera de THEMES.
  r.setProperty('--green', t.green);
  r.setProperty('--red', t.red);
  // v2.0.40: mismo bug que --green/--red arriba, detectado en auditoría
  // 2026-09-12 -- estas 10 variables tampoco se asignaban nunca aquí.
  r.setProperty('--disc-d', t.discD);
  r.setProperty('--disc-d-bg', t.discDBg);
  r.setProperty('--disc-i', t.discI);
  r.setProperty('--disc-i-bg', t.discIBg);
  r.setProperty('--disc-s', t.discS);
  r.setProperty('--disc-s-bg', t.discSBg);
  r.setProperty('--disc-c', t.discC);
  r.setProperty('--disc-c-bg', t.discCBg);
  r.setProperty('--red-border', t.redBorder);
  r.setProperty('--amber-border', t.amberBorder);
  r.setProperty('--input-bg', t.amberBg);
  r.setProperty('--bg-page', t.bg);
  r.setProperty('--bg-card', t.surface);
  r.setProperty('--text', t.ink);
  r.setProperty('--text-muted', t.inkSoft);
  // v2.0.36: semáforo de urgencia de las tarjetas del lanzador — ver
  // comentario de cabecera de THEMES.
  r.setProperty('--sem-naranja', t.semNaranja);
  r.setProperty('--sem-amarillo', t.semAmarillo);
  r.setProperty('--sem-amarillo-claro', t.semAmarilloClaro);
}

// Color de acento resuelto de un tema, en hex sin '#' (para usarlo en el
// PPTX, que no puede leer variables CSS directamente).
function accentHex(themeKey) {
  const t = THEMES[themeKey] || THEMES.medianoche;
  return t.cyan.replace('#', '').toUpperCase();
}

// Inicializa el tema de la ventana actual: lee el ajuste global guardado
// (window.themeAPI, expuesto por el preload correspondiente — ver
// preload.js/preload-launcher.js/preload-backup-picker.js/preload-security.js),
// lo aplica, y se suscribe a cambios en caliente hechos desde OTRA ventana
// (p.ej. cambias el tema en el launcher con un proyecto ya abierto). Cada
// ventana puede pasar un callback opcional `onChange` si necesita
// re-renderizar algo más al cambiar (p.ej. el color de acento del PPTX).
// Devuelve una Promise que resuelve con la clave de tema aplicada.
function initGlobalTheme(onChange) {
  if (!window.themeAPI) return Promise.resolve('medianoche');
  return window.themeAPI.get().then((key) => {
    const applied = THEMES[key] ? key : 'medianoche';
    applyTheme(applied);
    if (typeof onChange === 'function') onChange(applied);
    window.themeAPI.onChanged((newKey) => {
      const k = THEMES[newKey] ? newKey : 'medianoche';
      applyTheme(k);
      if (typeof onChange === 'function') onChange(k);
    });
    return applied;
  });
}
