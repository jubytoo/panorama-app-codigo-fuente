# Propuesta: integrar "Preparación de Reunión" en Panorama del Servicio

Estado: **implementada y entregada en 0.1.14, ampliada en 0.1.15.** El
usuario aprobó la Opción A ("perfecto asi. integralo") junto con la lista
completa de preguntas de más abajo, y se implementó tal cual — sin
recortar bloques. Para el detalle técnico completo, ver las entradas
0.1.14 y 0.1.15 en `claude/panorama-app-project-context.md`.

**Ampliación no prevista en esta propuesta original (0.1.15):** al probar
la 0.1.14, el usuario preguntó si las preparaciones se guardaban — NO se
guardaba nada (ver la sección "Qué queda fuera de alcance" más abajo, que
lo decía explícitamente). Se añadió un histórico completo: botón para
guardar cada preparación (con fecha), un panel para ver las guardadas de
ese proyecto, y precarga automática de los "Compromisos nuestros/cliente"
desde la última preparación guardada. Queda fuera todavía: cruzar el
histórico entre VARIOS proyectos (tendencias, riesgos repetidos) — se
planteó como una fase aparte, bastante más grande, no incluida.

## Qué se pidió

El usuario adjuntó `20260820_Preparacion_Reunion.html`: una herramienta
standalone (mismo estilo visual que el resto de la app) que guía, paso a
paso, la preparación de una reunión de seguimiento con el cliente —
Equipo, Hitos, Riesgos, Avances/Aplicaciones/Mejoras/Propuestas,
Pendientes de la reunión anterior — y genera un guion final imprimible o
descargable en `.txt`. Detecta candidatos automáticamente si se le sube un
backup JSON del dashboard (mismo esquema de cifrado que ya usa la app), y
opcionalmente extrae texto de un acta anterior (.docx/.pdf/.txt) para
resaltar líneas con palabras clave ("pendiente", "acción", "por
confirmar"...). Pidió: (1) si tiene cabida integrarla como se hizo con el
Directorio de Talento, y (2) una lista lo más completa posible de más
preguntas y puntos clave, en la misma línea que las que él ya había
escrito en el HTML original, para no despistarse en la reunión.

## Hallazgo clave (por qué era viable sin inventar mecanismo nuevo)

Igual que pasó con el Directorio de Talento: todo lo que la herramienta
necesita para el auto-detectado (equipo, hitos, riesgos) ya vive en el
backup automático que cada proyecto guarda solo (`state.team`,
`state.milestones`, `state.risks`) — el HTML del usuario ya estaba escrito
para leer exactamente ese formato, porque en su día se diseñó a partir de
un export del propio dashboard.

Había más margen del que parecía a primera vista: el dashboard YA calcula
un "resumen ejecutivo" completo con `executiveStatus()` (usado en su
propio panel de KPIs) — progreso del servicio en %, riesgos de nivel alta
abiertos, riesgos materializados, hitos retrasados, equipo activo/total,
próximo hito, entregables entregados/total. Es exactamente el tipo de
titulares con los que uno querría ABRIR una reunión de seguimiento, y ya
estaba calculado y probado — no hizo falta inventar la lógica, solo
reutilizarla como primer bloque del guion (implementado como
`executiveSummary()` en la nueva plantilla, con el mismo cálculo exacto —
ver nota sobre la corrección "2/2 vs 2/3" en la entrada 0.1.14).

Lo que NO existía en ningún sitio de la app (y sigue sin existir): horas/
presupuesto consumido, cumplimiento de SLA, incidencias formales (P1/P2),
encuestas o feedback de satisfacción del cliente, fechas de renovación de
contrato. Esos datos entran en el guion como texto libre que el usuario
escribe a mano cada vez (bloques 2 a 17 de la lista de abajo) — no hay
dato de origen que auto-detectar, porque el dashboard no los rastrea. Esto
sigue así en la versión implementada.

## Dos vías de integración técnica que se plantearon

**Opción A — Integración plena (la elegida), como el Directorio de Talento**
Ventana propia por proyecto ("Preparación de Reunión"), accesible desde el
menú "Proyecto" de cada ventana de dashboard, conectada directamente a
`window.panoramaBridge` para leer el backup del proyecto ACTUAL sin que el
usuario tenga que exportar/subir/descifrar nada a mano — el paso "Carga
inicial" del wizard se redujo a la carga automática, el JSON desapareció
como paso manual. mammoth.js y pdf.js (para leer el acta anterior) se
vendorizaron localmente, mismo patrón que ya existía para xlsx/pptx
(`vendor/**/*` + `fixVendorScriptPaths()` en `main.js`) — necesario porque
el ordenador del cliente puede no tener salida a internet, y antes esas
dos librerías se cargaban desde cdnjs.cloudflare.com en tiempo real.

**Opción B — Mínima (descartada)**
Dejar el HTML tal cual, standalone, con solo un acceso directo desde el
launcher. El usuario habría seguido exportando/subiendo el JSON a mano
cada vez, y las librerías del acta se habrían seguido cargando desde
internet. Menos esfuerzo, pero arrastraba ambas limitaciones
indefinidamente — no se eligió.

## Lista completa de preguntas y puntos clave (implementada íntegra)

Todos los bloques de esta lista se implementaron, sin recortar ninguno —
el usuario pidió expresamente que fuera "completo". Marco con **(auto)**
las que se auto-rellenan con datos que el dashboard ya tenía, y con
**(manual)** las que el usuario escribe cada vez porque no hay dato de
origen.

### 1. Resumen ejecutivo — primer bloque del guion (auto)
Vistazo de titulares con el mismo cálculo que ya usa el propio dashboard:
progreso del servicio (%), riesgos de nivel alta abiertos, riesgos
materializados desde la última reunión, hitos retrasados sin fecha real
registrada, equipo activo/total, entregables entregados/pendientes.

### 2. Indicadores de servicio y SLA (manual)
- ¿Se han cumplido los SLA acordados este periodo? Si alguno está en
  rojo, ¿por qué y qué se está haciendo?
- ¿Ha habido alguna incidencia grave (P1/P2) desde la última reunión?
  ¿Cómo se resolvió y en cuánto tiempo?
- ¿Hay algún indicador que hoy esté en verde pero con tendencia
  preocupante, para anticiparlo antes de que el cliente lo note?
- ¿Hay algún indicador que el cliente mide por su cuenta y que pueda no
  coincidir con el nuestro?

### 3. Horas y presupuesto (manual)
- ¿Cuántas horas o presupuesto se han consumido este periodo frente a lo
  previsto? ¿Vamos alineados con la fase del servicio en la que estamos?
- ¿Hay riesgo de sobreconsumo o infraconsumo antes del cierre de fase o
  de contrato?
- ¿Hace falta plantear hoy una ampliación de alcance, horas o
  presupuesto?
- ¿Hay alguna factura, revisión de precios o coste extra pendiente de
  comunicar o justificar?

### 4. Relación y satisfacción del cliente (manual)
- ¿Ha habido alguna queja o comentario negativo desde la última reunión?
  ¿Se ha resuelto o sigue abierto?
- ¿Hay algún interlocutor nuevo por parte del cliente que convenga
  presentar o tener en cuenta? ¿Y alguno que se haya ido?
- ¿Percibimos algún riesgo en la relación (frialdad, comparación con
  otro proveedor, dudas de renovación) que no esté ya en el apartado de
  Riesgos del proyecto?
- ¿Hay algo que el cliente lleve tiempo pidiendo y que aún no le hayamos
  dado respuesta clara?
- ¿Cómo fue el tono de la última reunión — quedó algo sin resolver que
  pueda volver a salir hoy?

### 5. Contrato y alcance (manual)
- ¿Hay alguna fecha de renovación o revisión de contrato próxima?
  ¿Cuánto queda y qué hay que preparar antes?
- ¿Alguna petición de cambio de alcance pendiente de formalizar por
  escrito?
- ¿Algo del contrato o del SLA que convendría revisar o renegociar?
- ¿Hay algún trabajo que se esté haciendo fuera de alcance sin que quede
  registrado en ningún sitio?

### 6. Seguridad y cumplimiento (manual)
- ¿Alguna incidencia de seguridad, auditoría o revisión de cumplimiento
  pendiente de comunicar?
- ¿Algún cambio normativo reciente que afecte a cómo se presta el
  servicio?
- ¿Hay accesos, permisos o credenciales que deberían revocarse o
  revisarse y que aún no se han tocado?
- ¿Alguna certificación o acreditación del servicio próxima a caducar?

### 7. Calidad del servicio y mejora continua (manual)
- ¿Qué ha funcionado especialmente bien este periodo?
- ¿Alguna lección aprendida de un problema reciente que convenga
  compartir?
- ¿Hay algún proceso interno que se haya cambiado y que afecte a cómo el
  cliente interactúa con el servicio?

### 8. Comunicación y gobierno del servicio (manual)
- ¿La cadencia de reuniones y canales de comunicación siguen siendo los
  adecuados?
- ¿Hay algún informe, cuadro de mando o entrega periódica retrasada?
- ¿Algún escalado que se haya activado desde la última reunión?

### 9. Herramientas, accesos y procesos internos (manual)
- ¿Algún acceso, credencial o entorno pendiente de dar de alta o de baja?
- ¿Ha cambiado alguna herramienta o proceso interno que el cliente debería
  saber?

### 10. Documentación y entregables formales (manual)
- ¿Hay actas, informes o entregables pendientes de aprobación o firma?
- ¿Toda la documentación técnica generada está donde el cliente puede
  encontrarla?

### 11. Oportunidades comerciales (manual)
- ¿Hay alguna necesidad del cliente detectada que podría convertirse en
  una ampliación de servicio (upsell)?
- ¿Algo que otro proveedor o equipo interno del cliente esté haciendo que
  podríamos ofrecer nosotros también?

### 12. Continuidad y plan de contingencia (manual)
- ¿Sigue vigente y probado el plan de continuidad/contingencia del
  servicio?
- ¿Hay algún punto único de fallo que convenga mitigar?

### 13. Equipo — más allá de altas/bajas (manual, complementa lo auto)
- ¿Necesita el equipo alguna formación, certificación o soporte que el
  cliente debería conocer o financiar?
- ¿Hay carga de trabajo desequilibrada o riesgo de burnout en el equipo?

### 14. Calendario y próximos pasos
- Próximos hitos del periodo que viene — **(auto)**, implementado como
  `hitosProximos()`, mirando hacia adelante (antes el wizard solo miraba
  "desde la última reunión hasta hoy").
- Ausencias previstas del equipo — **(auto)**, vía `t.scheduledExit`.
- ¿Queda fijada la fecha de la próxima reunión? — **(manual)**.
- ¿Hay algún hito crítico del próximo periodo con riesgo de retraso ya
  visible hoy?

### 15. Preguntas para el cliente (manual)
- ¿Qué llevamos tiempo esperando del cliente y conviene escalar hoy
  mismo?
- ¿Hay algo bloqueado por su lado que esté frenando algún hito o
  entregable?
- ¿Hay alguna decisión que necesitemos que tome HOY en la reunión?

### 16. Cierre de la reunión anterior — pendientes separados
Implementado: los pendientes de la reunión anterior se separan en dos
columnas — "Compromisos nuestros" y "Compromisos del cliente" — con
textareas independientes; cada punto detectado en el acta anterior tiene
dos botones ("+ nuestro" / "+ cliente") para clasificarlo directamente.

### 17. Checklist de cierre de ESTA reunión — nuevo paso al final
Implementado como paso propio del wizard, con 3 puntos:
- ¿Ha quedado claro y por escrito quién se lleva cada acción, con fecha?
- ¿Se ha confirmado la fecha de la próxima reunión de seguimiento?
- ¿No queda nada prometido "por email" sin enviar todavía hoy mismo?

## Qué queda fuera de alcance (sin cambios respecto a la propuesta original)

Los bloques de SLA, horas/presupuesto, satisfacción e incidencias siguen
como texto libre — el dashboard principal no rastrea esos datos como
campos propios. Si en algún momento interesa que también se
auto-detecten (como Equipo/Hitos/Riesgos), sería un proyecto aparte:
añadir esos campos al dashboard de cada proyecto primero, y solo entonces
la Preparación de Reunión los heredaría gratis. No se ha tocado el
dashboard principal como parte de esta entrega.

## Estado final

Entregado en 0.1.14 junto con el arreglo del combobox de Rol del
Directorio de Talento (pedido en el mismo mensaje). Ver
`claude/panorama-app-project-context.md`, entrada 0.1.14, para el detalle
técnico completo: qué se verificó con Xvfb+CDP simulando el flujo real
(incluida la apertura desde el menú nativo), qué se verificó en el `asar`
compilado, y qué quedó explícitamente sin probar (botones de imprimir/
descargar con click real, comportamiento fino en Windows real más allá
del arranque bajo Wine).
