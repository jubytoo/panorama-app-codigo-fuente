#!/usr/bin/env python3
"""
Genera el icono de "Panorama del Servicio" a partir de la propia paleta del
dashboard (fondo oscuro + acentos ámbar/cian que ya usa la plantilla HTML),
en vez de dejar el icono genérico de Electron.

Dibuja un radar/gauge (aguja + arco) sobre un cuadrado redondeado oscuro, con
tres "puntos de estado" (verde/ámbar/rojo) evocando el semáforo de riesgos del
propio dashboard. Se genera en 1024x1024 y desde ahí se derivan el resto de
tamaños (PNG sueltos + .ico multi-resolución para Windows).
"""
import math
from PIL import Image, ImageDraw

SIZE = 1024
BG = (10, 14, 19, 255)        # --bg
SURFACE = (18, 24, 33, 255)   # --surface
BORDER = (35, 46, 58, 255)    # --border
INK = (238, 242, 246, 255)    # --ink
CYAN = (79, 195, 217, 255)    # --cyan
AMBER = (240, 168, 60, 255)   # --amber
GREEN = (76, 175, 130, 255)   # --green
RED = (226, 89, 107, 255)     # --red


def rounded_square(size, radius_ratio, fill):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=fill)
    return img


def main():
    base = rounded_square(SIZE, 0.22, BG)
    d = ImageDraw.Draw(base)

    cx, cy = SIZE // 2, int(SIZE * 0.56)
    R = int(SIZE * 0.30)

    # Arco de fondo (pista del gauge)
    track_w = int(SIZE * 0.045)
    d.arc([cx - R, cy - R, cx + R, cy + R], start=160, end=380,
          fill=BORDER, width=track_w)

    # Arco de progreso (cian -> ámbar), dibujado en segmentos para simular
    # degradado sin depender de librerías extra.
    steps = 40
    start_a, end_a = 160, 300
    for i in range(steps):
        t0 = i / steps
        t1 = (i + 1) / steps
        a0 = start_a + (end_a - start_a) * t0
        a1 = start_a + (end_a - start_a) * t1
        col = tuple(int(CYAN[c] + (AMBER[c] - CYAN[c]) * t0) for c in range(3)) + (255,)
        d.arc([cx - R, cy - R, cx + R, cy + R], start=a0, end=a1, fill=col, width=track_w)

    # Aguja
    needle_angle_deg = 255
    needle_len = R - int(SIZE * 0.02)
    rad = math.radians(needle_angle_deg)
    nx = cx + needle_len * math.cos(rad)
    ny = cy + needle_len * math.sin(rad)
    d.line([cx, cy, nx, ny], fill=INK, width=int(SIZE * 0.028))
    hub_r = int(SIZE * 0.045)
    d.ellipse([cx - hub_r, cy - hub_r, cx + hub_r, cy + hub_r], fill=INK)
    inner_r = int(hub_r * 0.45)
    d.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=BG)

    # Tres puntos de estado (semáforo de riesgos) en la base
    dot_r = int(SIZE * 0.032)
    dot_y = int(SIZE * 0.855)
    gap = int(SIZE * 0.11)
    for i, col in enumerate((GREEN, AMBER, RED)):
        dxc = cx + (i - 1) * gap
        d.ellipse([dxc - dot_r, dot_y - dot_r, dxc + dot_r, dot_y + dot_r], fill=col)

    # Borde sutil del cuadrado
    d.rounded_rectangle([2, 2, SIZE - 3, SIZE - 3], radius=int(SIZE * 0.22),
                         outline=BORDER, width=int(SIZE * 0.006))

    base.save('assets/icon.png')

    # Derivar tamaños para Linux / uso como icono de ventana en dev.
    for s in (16, 24, 32, 48, 64, 128, 256, 512):
        base.resize((s, s), Image.LANCZOS).save(f'assets/icon-{s}.png')

    print('OK: assets/icon.png y tamaños derivados generados.')


if __name__ == '__main__':
    main()
