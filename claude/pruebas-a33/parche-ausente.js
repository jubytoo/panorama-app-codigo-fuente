'use strict';
const fs = require('fs');
const c = require('crypto');
const F = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\a3-3-diseno.md';
let t = fs.readFileSync(F, 'utf8');

t = t.split('diseño v4 rev. 6 — NÚCLEO CERRADO)').join('diseño v4 rev. 7 — NÚCLEO CERRADO)');
t = t.split('**336/336**').join('**394/394**');
t = t.split('NÚCLEO A3.3 — 336 OK, 0 FALLOS').join('NÚCLEO A3.3 — 394 OK, 0 FALLOS');
t = t.split('→ 254 (rev. 5) → **336**').join('→ 254 (rev. 5) → 336 (rev. 6) → **394**');
t = t.split('la suite emite **335 o 336** asertos').join('la suite emite **393 o 394** asertos');

// --- §4.e: el contrato de "ausente" -----------------------------------------
const contrato = `
### 4.e Requisito v4.15 — el contrato de "ausente"

> **"El archivo está ausente" es un HECHO OBSERVADO.**
> **"Crear una base de datos nueva" es una DECISIÓN DE INICIALIZACIÓN.**
> **No son sinónimos, y solo la segunda autoriza a escribir.**

Esto no es una sutileza terminológica: en Drive, un \`ENOENT\` observable puede ser
perfectamente transitorio —montaje aún no completo, sincronización en curso, la
ruta todavía no disponible— y la reacción "no hay nada, creo una base de datos
nueva" **sustituiría una base de datos valiosa que solo estaba invisible un
momento**. Es el escenario más destructivo de todo A3.3, y el más fácil de
provocar sin querer.

**NO autorizan a crear, por sí solos:**

| Señal | Por qué no basta |
|---|---|
| \`fs.existsSync(ruta) === false\` | Devuelve \`false\` ante **cualquier** error, no solo ante la ausencia. Un fallo transitorio de Drive es indistinguible de "no existe". **No se usa** |
| Un \`ENOENT\` aislado de \`readFileSync\` | En Drive puede ser transitorio. Es un hecho observado, no una conclusión |
| Que no haya \`.gen\` | Por sí solo no dice nada sobre si hubo una base de datos |
| Que la carpeta parezca vacía | Fail-closed: si no se puede ni listar, no se da por vacía |

**Lo único que autoriza es una bandera explícita del flujo que sabe que está
inicializando una ubicación nueva:**

\`\`\`
abrir({ crearSiAusente: true })
\`\`\`

Y aun con la bandera puesta, **se comprueba además que la carpeta no tiene
restos** (\`panorama.sqlite3\` ni nada que empiece por \`panorama.sqlite3.\`:
\`.gen\`, \`.tmp-\`, \`.conflicto-\`, \`.abandonado-\`…). Si los hay, no se crea nada.
Esa segunda comprobación no se puede saltar desde fuera.

**Comportamiento con \`estado === 'ausente'\` y sin la bandera**, en una ubicación
ya configurada:

- **No** se crea ninguna base de datos.
- **No** se escribe el \`.gen\`.
- Se devuelve \`ErrorDb('io', { noVerificable: true, estadoDisco: 'ausente' })\`,
  con \`podriaSerPrimeraVez\` como **pista informativa**, nunca como permiso.
- En **COMPARTIDA / DESCONOCIDA**: latch \`'degradado'\` — fail-closed hasta
  aclararlo. En **LOCAL** no se latchea: no hay otro PC posible (A3.1) y es un
  error reintentable.

Probado en §15, sección 14, incluida la recuperación: cuando el acceso vuelve,
se abre **la base de datos original**, con su commit y su generación, **sin
ninguna generación espuria** por medio.

Esto es especialmente importante para el arranque y el apagado que se probarán
end-to-end, y para el handoff PC A → PC B: el equipo B puede arrancar mientras
Drive todavía no le ha entregado el archivo, y **eso no puede acabar en una base
de datos nueva y vacía**.

---
`;

if (!t.includes('### 4.e Requisito v4.15')) {
  t = t.replace('## 5. Requisito 5 — política de fallo', contrato + '\n## 5. Requisito 5 — política de fallo');
}

// --- changelog rev. 7 --------------------------------------------------------
const marca = '- **v4 rev. 6**';
if (!t.includes('- **v4 rev. 7**')) {
  const rev7 = `- **v4 rev. 7** — cierre del núcleo. \`abrir()\` recuperaba por la puerta de
  atrás la distinción que la rev. 6 acababa de introducir: usaba
  \`fs.existsSync()\` **antes** de \`leerDisco()\`, y \`existsSync\` devuelve \`false\`
  ante cualquier error, así que un fallo transitorio de Drive podía leerse como
  "aquí no hay nada" y provocar la creación de una base de datos nueva sobre una
  ubicación con datos valiosos. **Eliminado el bypass**; \`abrir()\` pasa siempre
  por \`leerDisco()\`, y crear exige la bandera explícita \`crearSiAusente\` **más**
  que la carpeta no tenga restos. Nuevo **§4.e** con el contrato de "ausente".
`;
  t = t.replace(marca, rev7 + marca);
}

fs.writeFileSync(F, t, 'utf8');
console.log('lineas: ' + t.split(/\r?\n/).length);
console.log('sha256 doc: ' + c.createHash('sha256').update(fs.readFileSync(F)).digest('hex').toUpperCase());
