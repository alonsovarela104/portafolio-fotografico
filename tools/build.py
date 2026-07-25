#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera las imágenes del sitio y la galería del HTML a partir de tools/catalogo.py.

    python3 tools/build.py            # imágenes + HTML
    python3 tools/build.py --solo-html   # solo regenerar la galería del HTML

Genera DOS tamaños por foto:
  assets/img/thumb/<slug>.webp  →  la retícula (ligero, carga diferida)
  assets/img/full/<slug>.webp   →  el visor ampliado (solo al hacer clic)

Con 91 fotos esto importa: si la retícula usara las grandes, recorrer la galería
descargaría decenas de MB. Así la carga inicial son unos cuantos cientos de KB.

Detalles que un conversor genérico no hace:
  · Respeta la orientación EXIF del iPhone (si no, las fotos salen acostadas).
  · Recorta la barra de la app Seestar en las astrofotos de 1080x1920.
  · Recorta al centro los planetas (ZOOM), que salen como un punto diminuto.
"""

import re
import sys
import pathlib
from PIL import Image, ImageOps

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from catalogo import FOTOS, HERO, ABOUT, ZOOM, CATEGORIAS, ETIQUETA  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "photos" / "source"
IMG = ROOT / "assets" / "img"

SEESTAR_BAR_PX = 180          # barra de la app en las astrofotos de 1080x1920
PERFILES = {
    "thumb": dict(max_w=800,  q=76, target_kb=110),
    "full":  dict(max_w=1600, q=80, target_kb=280),
    "hero":  dict(max_w=2000, q=78, target_kb=320),
}
MIN_Q = 58


def cargar(rel):
    """Abre la foto ya orientada y con los recortes que le tocan."""
    im = ImageOps.exif_transpose(Image.open(SRC / rel)).convert("RGB")
    # Los exports de la app Seestar traen una barra con el objeto y la exposición.
    # Salen a 1080 de ancho, pero la altura varía (1920, 1935, 1964...), así que
    # no sirve comparar contra un tamaño exacto.
    if im.width == 1080 and im.height >= 1900:
        im = im.crop((0, 0, im.width, im.height - SEESTAR_BAR_PX))
    return im


def centro_brillante(im):
    """Centroide de las zonas claras. Los planetas no salen centrados en el
    encuadre del telescopio, así que un recorte al centro los dejaría fuera."""
    g = im.convert("L").resize((160, 160))
    px = g.load()
    umbral = max(30, max(px[x, y] for x in range(160) for y in range(160)) * 0.45)
    sx = sy = n = 0
    for y in range(160):
        for x in range(160):
            if px[x, y] >= umbral:
                sx += x; sy += y; n += 1
    if not n:
        return 0.5, 0.5
    return sx / n / 160, sy / n / 160


def guardar(im, destino, perfil, slug=None):
    cfg = PERFILES[perfil]
    if slug in ZOOM:                     # planetas: acercar y centrar en el objeto
        f = ZOOM[slug]
        w, h = im.size
        cx, cy = centro_brillante(im)
        nw, nh = int(w * f), int(h * f)
        x0 = min(max(int(cx * w - nw / 2), 0), w - nw)
        y0 = min(max(int(cy * h - nh / 2), 0), h - nh)
        im = im.crop((x0, y0, x0 + nw, y0 + nh))

    if im.width > cfg["max_w"]:
        im = im.resize((cfg["max_w"], round(im.height * cfg["max_w"] / im.width)), Image.LANCZOS)

    destino.parent.mkdir(parents=True, exist_ok=True)
    q = cfg["q"]
    im.save(destino, "WEBP", quality=q, method=6)
    while destino.stat().st_size / 1024 > cfg["target_kb"] and q > MIN_Q:
        q -= 6
        im.save(destino, "WEBP", quality=q, method=6)
    return im.size, destino.stat().st_size / 1024


def construir_imagenes():
    print(f"Procesando {len(FOTOS)} fotos (+ portada y retrato)\n")

    rel, slug, _ = HERO
    size, kb = guardar(cargar(rel), IMG / f"{slug}.webp", "hero")
    print(f"  portada    {slug:22s} {size[0]}x{size[1]} {kb:6.0f} KB")

    rel, slug, _ = ABOUT
    size, kb = guardar(cargar(rel), IMG / f"{slug}.webp", "full")
    print(f"  retrato    {slug:22s} {size[0]}x{size[1]} {kb:6.0f} KB")

    formas = {}
    total_kb = 0
    for rel, slug, cat, dest, titulo, alt in FOTOS:
        if not (SRC / rel).exists():
            print(f"  !! FALTA {rel}")
            continue
        base = cargar(rel)
        (tw, th), tkb = guardar(base.copy(), IMG / "thumb" / f"{slug}.webp", "thumb", slug)
        _,       fkb = guardar(base.copy(), IMG / "full" / f"{slug}.webp", "full", slug)
        total_kb += tkb + fkb
        formas[slug] = "wide" if tw / th > 1.15 else "tall"
        print(f"  {cat:6s} {'★' if dest else ' '} {slug:22s} {tw}x{th} "
              f"thumb {tkb:5.0f} KB · full {fkb:6.0f} KB · {formas[slug]}")

    print(f"\n  total imágenes de galería: {total_kb/1024:.1f} MB")
    return formas


def formas_desde_disco():
    formas = {}
    for _, slug, *_ in FOTOS:
        p = IMG / "thumb" / f"{slug}.webp"
        if p.exists():
            w, h = Image.open(p).size
            formas[slug] = "wide" if w / h > 1.15 else "tall"
    return formas


def esc(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def construir_html(formas):
    """Inyecta los botones de filtro y las figuras entre los marcadores del HTML."""
    filtros = []
    for valor, etiqueta in CATEGORIAS:
        activo = ' is-active' if valor == "destacadas" else ''
        sel = 'true' if valor == "destacadas" else 'false'
        filtros.append(
            f'          <button class="filter-btn{activo}" type="button" '
            f'data-filter="{valor}" role="tab" aria-selected="{sel}">{etiqueta}</button>'
        )

    figuras = []
    for rel, slug, cat, dest, nota, alt in FOTOS:
        if slug not in formas:
            continue
        destacada = ' data-featured' if dest else ''
        # Al pasar el cursor solo se muestra la etiqueta del país/tema. Las
        # astrofotos añaden su dato (objeto y exposición), que sí aporta algo.
        pie = f'<span>{ETIQUETA[cat]}</span>' + (f' {esc(nota)}' if nota else '')
        figuras.append(f"""          <figure class="gallery-item" data-aspect="{formas[slug]}" data-category="{cat}"{destacada} data-reveal>
            <button class="gallery-trigger" type="button" data-full="assets/img/full/{slug}.webp">
              <img class="gallery-img" src="assets/img/thumb/{slug}.webp" alt="{esc(alt)}" loading="lazy" decoding="async" />
              <figcaption class="gallery-caption">{pie}</figcaption>
            </button>
          </figure>""")

    def inyectar(html, marca, contenido):
        patron = re.compile(rf"(<!-- {marca}:inicio -->).*?(<!-- {marca}:fin -->)", re.S)
        nuevo, n = patron.subn(lambda m: f"{m.group(1)}\n{contenido}\n        {m.group(2)}", html)
        if n != 1:
            raise SystemExit(f"ERROR: no encontré los marcadores {marca}:inicio/fin en index.html")
        return nuevo

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = inyectar(html, "FILTROS", "\n".join(filtros))
    html = inyectar(html, "GALERIA", "\n\n".join(figuras))
    (ROOT / "index.html").write_text(html, encoding="utf-8")

    n_dest = sum(1 for f in FOTOS if f[3] and f[1] in formas)
    unidades = sum(2 if formas[f[1]] == "wide" else 1 for f in FOTOS if f[3] and f[1] in formas)
    print(f"\n  HTML: {len(figuras)} fotos · {n_dest} destacadas "
          f"({unidades} columnas → {'cuadra' if unidades % 4 == 0 else 'NO cuadra'} en 4 columnas)")


if __name__ == "__main__":
    formas = formas_desde_disco() if "--solo-html" in sys.argv else construir_imagenes()
    construir_html(formas)
    print("\nListo.")
