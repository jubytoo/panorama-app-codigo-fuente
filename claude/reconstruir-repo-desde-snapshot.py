#!/usr/bin/env python3
"""
Reconstruye el árbol de archivos real de "Panorama del Servicio" a partir
del snapshot de texto guardado en el Project (panorama-app-full-source.md).

PARA QUÉ SIRVE
--------------
Plan B para cuando se abre un chat nuevo en el Project sin adjuntar el
repo real. El snapshot en el Project es un único documento markdown con
todo el código fuente propio, cada archivo en su propio bloque:

    ## `ruta/al/archivo.ext`

    ```lenguaje
    contenido del archivo
    ```

Este script deshace ese aplanado: separa cada bloque y escribe el archivo
en su ruta original, dentro de un directorio de salida.

CÓMO USARLO EN UNA SESIÓN NUEVA
--------------------------------
1. `project_read` sobre `panorama-app-full-source.md` (el Project ya
   escribe el contenido a un archivo local y devuelve la ruta).
2. Ejecutar:
       python3 reconstruir-repo-desde-snapshot.py <ruta_snapshot.md> <dir_salida>
   Ejemplo:
       python3 reconstruir-repo-desde-snapshot.py /ruta/al/snapshot.md /home/claude/panorama-app
3. Dentro de `<dir_salida>`, ejecutar `npm install` (no viaja en el
   snapshot: son dependencias generadas, no código propio).

LIMITACIONES CONOCIDAS (léelas antes de confiar ciegamente en esto)
---------------------------------------------------------------------
- El snapshot solo está tan actualizado como la última vez que alguien
  pidió refrescarlo — puede no reflejar cambios muy recientes hechos en
  una sesión que no llegó a sincronizarlo. Comprobar la fecha/versión
  mencionada en la cabecera del propio snapshot.
- No incluye `vendor/` (librerías de terceros minificadas), `assets/`
  (binarios/imágenes) ni `node_modules`/`dist_build` — hay que
  recuperarlos aparte si hacen falta (vendor/assets no cambian casi
  nunca; puede pedirse al usuario que los adjunte si un build completo
  los necesita).
- El parseo asume que ningún archivo fuente contiene la secuencia literal
  de tres backticks (```) en su contenido — cierto a fecha de este
  script (comprobado con `grep` sobre todos los archivos incluidos), pero
  si en el futuro algún archivo la incluyera (p. ej. un README con un
  bloque de código de ejemplo dentro), el parseo de ESE archivo se
  rompería. Si el número de archivos reconstruidos no coincide con el
  número de cabeceras `## \`...\`` del snapshot, es la primera sospecha a
  revisar.
- Esto reconstruye ARCHIVOS DE TEXTO. No reemplaza tener git ni el
  histórico de commits — es solo la foto del código, sin historial de
  cambios línea a línea.
"""

import re
import sys
import os


def reconstruir(snapshot_path, salida_dir):
    with open(snapshot_path, 'r', encoding='utf-8') as f:
        texto = f.read()

    # Cada sección empieza con "## `ruta`" en su propia línea.
    patron_cabecera = re.compile(r'^## `([^`]+)`\s*$', re.MULTILINE)
    cabeceras = list(patron_cabecera.finditer(texto))

    if not cabeceras:
        print("No se encontró ninguna cabecera '## `ruta`' — ¿es el archivo correcto?")
        sys.exit(1)

    escritos = []
    fallidos = []

    for i, m in enumerate(cabeceras):
        ruta_rel = m.group(1)
        inicio_bloque = m.end()
        fin_bloque = cabeceras[i + 1].start() if i + 1 < len(cabeceras) else len(texto)
        bloque = texto[inicio_bloque:fin_bloque]

        # Dentro del bloque: primera línea ```lenguaje (o ``` a secas) tras
        # la cabecera, y la ÚLTIMA línea ``` del bloque como cierre.
        primer_fence = re.search(r'```[^\n]*\n', bloque)
        ultimo_fence_pos = bloque.rfind('```')

        if not primer_fence or ultimo_fence_pos == -1 or ultimo_fence_pos <= primer_fence.end():
            fallidos.append(ruta_rel)
            continue

        contenido = bloque[primer_fence.end():ultimo_fence_pos]
        # El generador deja el contenido sin salto de línea final antes del
        # cierre de fence; se añade uno al escribir, como es habitual.
        contenido = contenido.rstrip('\n') + '\n'

        destino = os.path.join(salida_dir, ruta_rel)
        os.makedirs(os.path.dirname(destino) or '.', exist_ok=True)
        with open(destino, 'w', encoding='utf-8') as out:
            out.write(contenido)
        escritos.append(ruta_rel)

    print(f"Reconstruidos {len(escritos)} archivos en: {salida_dir}")
    if fallidos:
        print(f"AVISO — {len(fallidos)} archivo(s) no se pudieron parsear correctamente:")
        for r in fallidos:
            print(f"  - {r}")
        print("Revisar manualmente esos casos en el snapshot antes de confiar en el resto.")

    print("\nRecuerda: falta 'npm install' dentro de esa carpeta (node_modules no viaja")
    print("en el snapshot), y vendor/ + assets/ si el build los necesita y no están ya ahí.")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Uso: python3 {os.path.basename(__file__)} <ruta_snapshot.md> <directorio_salida>")
        sys.exit(1)
    reconstruir(sys.argv[1], sys.argv[2])
