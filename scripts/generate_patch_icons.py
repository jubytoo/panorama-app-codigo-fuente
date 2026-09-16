#!/usr/bin/env python3
"""
Genera los iconos del diálogo nativo "Aplicar parche" (check verde / triángulo
de aviso ámbar) en VARIOS tamaños exactos, en vez de un único PNG grande que
Windows tiene que reescalar él solo al tamaño real del icono del diálogo.

v2.0.20 ya generaba estos iconos con supersampling (2048px -> 256px LANCZOS)
y se veían nítidos como imagen suelta -- pero el usuario los sigue viendo mal
("la resolucion del check verde sigue siendo mala") DENTRO del diálogo nativo
de Windows. Causa: dialog.showMessageBox recibía un único PNG de 256x256 como
`icon`, y es WINDOWS quien lo reescala en tiempo real al tamaño que realmente
ocupa el icono del diálogo (que ronda 32x32 lógicos, más grande según el
escalado de pantalla/DPI) -- y ese reescalado interno de Windows NO usa un
filtro de calidad tipo LANCZOS, así que por muy nítido que sea el PNG de
origen, el resultado final en pantalla sale borroso/con bloques otra vez.

Arreglo real: no dejar que Windows reescale NADA. Aquí se generan tamaños
EXACTOS (32/40/48/56/64/80/96/128/160/192/256 -- cubre de 100% a 300% de
escalado de pantalla sobre una base de 32px), cada uno reducido por separado
desde el máster de alta resolución con LANCZOS (nunca encadenando reducciones
de un tamaño ya reducido). main.js construye un nativeImage con todos esos
tamaños como "representations" (ver buildPatchIcon en main.js) para que
Windows elija directamente la que más se ajuste a su escalado actual, sin
tener que reescalar ninguna él mismo.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

MASTER = 2048  # resolución de render antes de reducir -- igual que en 2.0.20
SIZES = [32, 40, 48, 56, 64, 80, 96, 128, 160, 192, 256]

GREEN = (22, 163, 94, 255)
GREEN_LIGHT = (52, 199, 130, 255)
AMBER = (245, 158, 11, 255)
AMBER_LIGHT = (250, 190, 80, 255)
WHITE = (255, 255, 255, 255)

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'patch-icons')


def with_shadow(img, blur=40, offset=(0, 26), opacity=90):
    """Sombra suave detrás del icono, sobre lienzo transparente del mismo tamaño."""
    size = img.size
    shadow = Image.new('RGBA', size, (0, 0, 0, 0))
    alpha = img.split()[3].point(lambda a: min(a, opacity))
    shadow.paste((0, 0, 0, 255), (offset[0], offset[1]), alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    out = Image.alpha_composite(shadow, img)
    return out


def render_check(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    r = size * 0.42

    # relleno con degradado radial simple (centro más claro) para dar volumen
    steps = 48
    for i in range(steps, 0, -1):
        t = i / steps
        rr = r * t
        col = tuple(int(GREEN_LIGHT[c] + (GREEN[c] - GREEN_LIGHT[c]) * (1 - t)) for c in range(3)) + (255,)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)

    # brillo superior sutil
    hl = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse([cx - r * 0.6, cy - r * 0.85, cx + r * 0.6, cy - r * 0.1], fill=(255, 255, 255, 60))
    hl = hl.filter(ImageFilter.GaussianBlur(size * 0.03))
    img = Image.alpha_composite(img, hl)
    d = ImageDraw.Draw(img)

    # marca de check, trazo grueso con extremos redondeados
    lw = max(2, int(size * 0.095))
    p1 = (cx - r * 0.46, cy + r * 0.02)
    p2 = (cx - r * 0.12, cy + r * 0.36)
    p3 = (cx + r * 0.52, cy - r * 0.34)
    d.line([p1, p2, p3], fill=WHITE, width=lw, joint='curve')
    for p in (p1, p2, p3):
        d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=WHITE)

    return with_shadow(img, blur=size * 0.02, offset=(0, int(size * 0.015)), opacity=70)


def render_warning(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = size / 2
    top = size * 0.08
    bottom = size * 0.90
    half_w = size * 0.46

    tri = [(cx, top), (cx - half_w, bottom), (cx + half_w, bottom)]

    # relleno con degradado vertical simple (más claro arriba)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).polygon(tri, fill=255)
    grad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for y in range(size):
        t = max(0.0, min(1.0, (y - top) / (bottom - top)))
        col = tuple(int(AMBER_LIGHT[c] + (AMBER[c] - AMBER_LIGHT[c]) * t) for c in range(3)) + (255,)
        ImageDraw.Draw(grad).line([(0, y), (size, y)], fill=col)
    grad.putalpha(mask)
    img = Image.alpha_composite(img, grad)
    d = ImageDraw.Draw(img)

    # signo de exclamación: barra + punto, esquinas rectas (ya probado antes
    # que redondearlas con blur+threshold daba un efecto "derretido")
    bar_w = size * 0.075
    bar_top = top + size * 0.22
    bar_bottom = top + size * 0.56
    d.rectangle([cx - bar_w / 2, bar_top, cx + bar_w / 2, bar_bottom], fill=WHITE)
    dot_r = bar_w * 0.62
    dot_cy = top + size * 0.68
    d.ellipse([cx - dot_r, dot_cy - dot_r, cx + dot_r, dot_cy + dot_r], fill=WHITE)

    return with_shadow(img, blur=size * 0.02, offset=(0, int(size * 0.015)), opacity=70)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    master_check = render_check(MASTER)
    master_warning = render_warning(MASTER)

    for size in SIZES:
        master_check.resize((size, size), Image.LANCZOS).save(
            os.path.join(OUT_DIR, f'valid-{size}.png'))
        master_warning.resize((size, size), Image.LANCZOS).save(
            os.path.join(OUT_DIR, f'invalid-{size}.png'))

    # tamaño "de referencia" suelto (compatibilidad con quien solo quiera
    # ver el icono como imagen, no usado por main.js para el diálogo)
    master_check.resize((256, 256), Image.LANCZOS).save(
        os.path.join(os.path.dirname(__file__), '..', 'assets', 'patch-valid-check.png'))
    master_warning.resize((256, 256), Image.LANCZOS).save(
        os.path.join(os.path.dirname(__file__), '..', 'assets', 'patch-invalid-warning.png'))

    print(f'OK: {len(SIZES)} tamaños x 2 iconos generados en {OUT_DIR}')


if __name__ == '__main__':
    main()
