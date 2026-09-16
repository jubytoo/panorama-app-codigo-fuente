'use strict';
const fs = require('fs');
const F = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\a3-3-diseno.md';
let t = fs.readFileSync(F, 'utf8');

// 1. cabecera -> rev. 6, 335/335
t = t.replace('diseño v4 rev. 5)', 'diseño v4 rev. 6 — NÚCLEO CERRADO)');
t = t.replace('> aplicación **no está autorizada**', '> aplicación **no está autorizada**');
t = t.replace('**254/254**', '**335/335**');

// 2. changelog
const marca = '- **v4 rev. 5**';
if (!t.includes('- **v4 rev. 6**')) {
  const rev6 = `- **v4 rev. 6** — tres ajustes de cierre del núcleo:
  - **Nombres temporales globalmente únicos**: \`.tmp-<writer>-<nonce>\` en vez de
    \`.tmp-<pid>\`. El PID no distingue dos PCs sobre la misma carpeta de Drive, y
    los \`.tmp\` supervivientes se tratan como posibles imágenes de recuperación.
  - **"No he podido leer" deja de ser "conflicto"**: \`leerDisco()\` devuelve cuatro
    estados explícitos (\`valida\` / \`ausente\` / \`no-disponible\` / \`ilegible\`) y cada
    uno tiene su política. Un EIO de Drive **nunca** se etiqueta como bifurcación.
  - **§8.a** dejaba escrito "el .gen SIN fsync", de la rev. 3, contradiciendo a
    §4.b y al código. Corregido: \`fsync\` en los dos archivos, y separado lo
    medido de lo derivado.
`;
  t = t.replace(marca, rev6 + marca);
}

// 3. §15: sección de cierre
const cierre = `
### 15.h Cierre del núcleo (rev. 6): los tres últimos ajustes

**1. Nombres temporales globalmente únicos.** \`escribirAtomico()\` usaba
\`.tmp-\${process.pid}\`. Suficiente para A3.1 (dos instancias del mismo equipo),
**insuficiente para A3.3**, que existe justamente para equipos distintos: dos PCs
pueden tener el mismo PID sobre el mismo espacio de nombres sincronizado. Y
como al arrancar algunos \`.tmp\` supervivientes se tratan como posibles imágenes
de recuperación (§4.c), un equipo no debe poder abrir ni truncar el temporal de
otro writer por coincidencia de nombre.

Ahora: \`.tmp-<writer>-<nonce>\`, con el \`installation-id\` recortado y 8 bytes
aleatorios (más el prefijo del commit cuando existe). Los \`.tmp-fallido-\`
heredan la misma unicidad. Siguen empezando por \`.tmp-\`, así que la limpieza por
prefijo de \`db.js:34-41\` sigue funcionando.

Probado (§15, sección 12): dos núcleos con \`installationId\` distintos **en el
mismo proceso** —o sea, con el mismo \`process.pid\`— sobre la misma carpeta:
ningún nombre coincide, todos son distintos entre sí, el nombre no contiene el
PID y sí el writer. Y 50 escrituras del **mismo** writer producen 50 nombres
distintos.

**2. "No he podido leer" NO es "he demostrado un conflicto".** Era un defecto
real: \`leerDisco()\` devolvía \`null\` ante cualquier fallo de \`readFileSync\`,
\`clasificar()\` devolvía \`'leer-disco'\`, y \`escribirMultiple()\` acababa tratando
todo lo que no fuera espera/degradado como \`latch 'conflicto'\` +
\`ErrorDb('conflicto')\`. Un EIO transitorio de Drive se convertía en una
bifurcación inventada.

\`leerDisco()\` devuelve ahora **cuatro estados explícitos**:

| Estado | Cuándo | Política |
|---|---|---|
| \`valida\` | Se leyó y es una imagen coherente | Clasificación normal |
| \`ausente\` | \`ENOENT\` | **No verificable.** Nunca conflicto |
| \`no-disponible\` | Existe pero no se pudo leer (\`EIO\`, \`EBUSY\`, \`EACCES\`, \`EPERM\`, corte de Drive) | **No verificable.** Nunca conflicto |
| \`ilegible\` | Se leyó, pero no abre / falla \`integrity_check\` / no tiene \`db_commit_id\` | Latch \`'bd-ilegible'\` (daño demostrado) |

Y el mapeo, que es donde estaba el error:

- **COMPARTIDA o DESCONOCIDA** → \`ErrorDb('io', { noVerificable: true })\` y latch
  **\`'degradado'\`**, que es levantable solo en cuanto el disco vuelva a leerse.
  **Nunca \`'conflicto'\`, nunca un \`caso\`.**
- **LOCAL** → \`ErrorDb('io', { noVerificable: true })\` **sin latch**: no hay otro
  PC posible (A3.1), así que es un error de E/S transitorio y reintentable. Y
  tampoco se inventa parentesco.
- **Al arrancar**, \`no-disponible\` **no** latchea \`'bd-ilegible'\` y **no** crea
  una base de datos vacía encima: el archivo puede estar perfectamente bien y lo
  que ha fallado es leerlo.

Probado (§15, sección 13) con \`EIO\`, \`EBUSY\` y \`EACCES\` × las dos políticas, más
\`ENOENT\`, los cuatro estados por separado, y el arranque: en todos, **el SQL del
usuario no se ejecuta, la memoria no se toca, el disco no se toca, no se
etiqueta como conflicto ni se inventa un caso**, y al recuperar el acceso el
latch se levanta y la escritura siguiente clasifica bien, sin conflicto falso.

Esto es además lo que hará falta para integrar \`driveOutageActive\` (§5.c) sin
que un corte de Drive se convierta en una avalancha de conflictos falsos.

**3. §8.a contradecía la política de \`fsync\` vigente.** Decía "el \`.gen\` SIN
fsync", que era de la rev. 3. Corregido: la secuencia de §8.a es ahora
literalmente temporal → escritura completa → \`fsync\` → \`rename\` para el \`.gen\`,
y lo mismo para el \`.sqlite3\`, con el **segundo \`rename\` como punto de
confirmación**. Y las cifras separan lo **medido** de lo **derivado**: no
presento ningún "coste total con A3.3" como medida, porque A3.3 no está
integrado y ese ciclo no se ha cronometrado.

### 15.i Resultado de cierre

\`\`\`
NÚCLEO A3.3 — 335 OK, 0 FALLOS
\`\`\`

Progresión: 112 (rev. 4, con 2 pruebas que no valían) → 254 (rev. 5) → **335**
(rev. 6).

**Sigue sin estar demostrado**, sin cambios respecto a §15.g: nada toca la
aplicación; los cortes de corriente se simulan manipulando archivos; el multi-PC
se simula con dos núcleos sobre una carpeta local, no son dos máquinas ni es
Drive; y que \`fsync\` devuelva no demuestra que Drive haya subido nada — (1)
Panorama terminó de escribir, (2) el sistema de archivos aceptó y (3) Drive
terminó de sincronizar son tres estados distintos, y **1 y 2 no demuestran 3**.

**Cerrar el núcleo no cierra A3.3.** Falta la matriz end-to-end acordada.
`;

if (!t.includes('### 15.h Cierre del núcleo')) {
  t = t.replace(/\s+$/, '') + '\n' + cierre;
}

fs.writeFileSync(F, t, 'utf8');
console.log('lineas: ' + t.split(/\r?\n/).length);
