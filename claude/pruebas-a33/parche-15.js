'use strict';
const fs = require('fs');
const F = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\a3-3-diseno.md';
let t = fs.readFileSync(F, 'utf8');

const nuevo = `
### 15.e Revisión de la rev. 4: seis defectos corregidos (rev. 5)

Todos encontrados leyendo el código del núcleo y sus pruebas, no ejecutándolo.
Dos de ellos eran **pruebas que no probaban nada**.

**1. La frontera del rollback empezaba demasiado tarde.** El \`try\` que restaura
empezaba en la persistencia, así que quedaban fuera \`db.run\` del usuario,
\`last_insert_rowid()\` y los cuatro UPSERT internos. Un SQL inválido podía dejar
\`dirty === true\` sin restaurar; un fallo en el tercer UPSERT podía dejar
\`app_meta\` parcialmente modificado en memoria. **Corregido**: la máquina de
estados de §2 con dos \`try\` explícitos, y la frontera marcada por \`confirmado\`.
Probado en los **ocho** puntos de fallo posibles (\`sql\`, \`lastid\`, \`meta1\`..\`meta4\`,
\`gen\`, \`persist\`) más SQL inválido real y violación de constraint real, y en
todos: disco intacto, memoria restaurada, \`app_meta\` intacto, \`dirty === false\`,
\`aplicado === false\`, sin latch, y **la escritura siguiente no arrastra nada
parcial** (la generación avanza exactamente 1 desde la última buena).

**2. La prueba de inmutabilidad era una tautología.** Comparaba
\`Buffer.compare(antes, antes)\`, que siempre da 0. **No demostraba nada y no debía
contar como evidencia.** Corregida: ahora se conserva **la referencia** al Buffer
que el núcleo guarda y **una copia snapshot** independiente, se fuerza actividad
para que sql.js crezca y reutilice su heap, y se compara referencia contra
snapshot. Además se comprueba que la imagen confirmada nueva es otro objeto con
otros bytes y que la antigua conserva los suyos.

**3. La prueba de "no se creó una base vacía encima" también era tautológica.**
Comparaba \`statSync(p).size === statSync(p).size\`. Corregida: se guardan bytes,
tamaño y SHA-256 **antes** de \`abrir()\`, y después se comprueba que el archivo
corrupto sigue existiendo con **el mismo SHA-256 y los mismos bytes exactos**,
que el \`.gen\` tampoco se tocó y que no aparecieron temporales. La propiedad que
importa no es que \`abrir()\` lance, sino que el mecanismo **no destruya un archivo
que puede tener valor forense o ser recuperable**. Comprobado para ceros,
truncado y basura.

**4. \`reparar-gen\` significaba una cosa en \`clasificar()\` y otra en \`run()\`.**
Se elige **la opción B, declarada explícitamente**: la escritura nueva sustituye
al testigo interrumpido, porque su commit se encadena desde \`C_disk\` (=== \`C_mem\`,
garantizado por las cuatro condiciones de B1). No hay un paso de reparación
aparte porque sería escribir el \`.gen\` dos veces para el mismo resultado.
**Pero el testigo adelantado se preserva** como \`.gen.interrumpido-<fecha>\` antes
de sustituirlo. Probado con el escenario exacto (\`.gen\` = Y padre X writer=yo,
BD = X, memoria = X, y después una escritura Z):

| Pregunta | Respuesta comprobada |
|---|---|
| \`parent_commit_id\` de Z | **X**, no Y |
| Qué ocurre con Y | Nunca existió como estado de la base de datos; no entra en el historial |
| Qué testigo queda | \`.gen.interrumpido-<fecha>\` con Y, su padre X y su writer |
| ¿Rama falsa? | No: \`.gen\` y BD quedan en Z, y Y no aparece en \`H_disk\` |
| ¿Se pierde algo? | No: la fila anterior sigue, y la de la escritura interrumpida nunca llegó a existir |

**5. El documento tenía dos definiciones de \`bloquearEscrituras()\`.** La segunda
—\`{ escrituraBloqueada = motivo; }\`— destruiría el fail-stop de B2 si alguien la
copiara. **Eliminada** (§3).

**6. Los dos \`DELETE\` de \`deleteProjectById\` eran dos commits.** Con eso seguía
existiendo un estado parcial: archivos apartados, \`DELETE FROM backups\`
confirmado, conflicto, \`DELETE FROM projects\` rechazado. **Corregido en el
diseño** (§14.d) y **el mecanismo está implementado y probado**:
\`escribirMultiple()\` aplica varias sentencias sobre la misma imagen con un solo
commit y un solo \`rename\`. La suite comprueba las dos caras: dos \`DELETE\` = una
generación y borrado completo; y con un fallo anterior al \`rename\`, **el proyecto
queda completo, filas y backups**. Incluye el **contraste** con dos \`run()\`
separados, que sí deja \`projects=1, backups=0\` en disco.

### 15.f Resultado tras las correcciones

\`\`\`
NÚCLEO A3.3 — 254 OK, 0 FALLOS      (antes: 112, de las cuales 2 no valían)
\`\`\`

Lo nuevo respecto a la rev. 4: 8 puntos de fallo pre-confirmación × 10
comprobaciones cada uno, SQL inválido y constraint reales, caso (c) desde un
fallo intermedio, \`reparar-gen\` completo, escritura múltiple y su contraste, y
las dos pruebas tautológicas rehechas.

### 15.g Lo que sigue SIN estar demostrado

Sin cambios respecto a la rev. 4, y conviene repetirlo:

- **Nada de esto toca la aplicación.** \`db.js\`, \`main.js\` y \`security.js\` están
  intactos.
- **Los cortes de corriente se simulan manipulando archivos**, no cortando la
  luz. Un apagado real no está demostrado ni es demostrable así.
- **La condición multi-PC se simula** con dos instancias del núcleo sobre la
  misma carpeta local. No es Drive, ni son dos máquinas.
- **Que \`fsync\` devuelva no demuestra que Drive haya subido nada.** Son tres
  estados distintos: (1) Panorama terminó de escribir, (2) el sistema de
  archivos aceptó, (3) Drive terminó de sincronizar. **1 y 2 no demuestran 3.**
- Siguen sin implementar, por acuerdo: \`consolidarMetaRekey\`, latch
  \`'adoptando'\`, revalidación de \`securityKey\`, \`accionAplicada\`, huella local
  persistente, y toda la integración de §14.
- **Cerrar el núcleo aislado no cierra A3.3.** Falta la revisión end-to-end de
  Panorama completo, con la matriz de escenarios por estados
  (BD / archivos / memoria / cifrado / IPC / Drive / tras reiniciar / datos
  perdidos sí-no) y el escenario de handoff PC A → PC B en sus seis variantes
  de sincronización. Cada escenario deberá quedar marcado como diseñado,
  implementado, unitario-simulado, prueba real o pendiente.
`;

if (t.includes('### 15.e Revisión de la rev. 4')) { console.log('ya estaba'); process.exit(0); }
t = t.replace(/\s+$/, '') + '\n' + nuevo;
fs.writeFileSync(F, t, 'utf8');
console.log('anadido. lineas: ' + t.split(/\r?\n/).length);
