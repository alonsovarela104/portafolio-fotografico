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
import json
import datetime
import pathlib
from PIL import Image, ImageOps

# La consola de Windows (cp1252) no sabe imprimir ★ ni →; sin esto el script se cae.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from catalogo import FOTOS, HERO, ABOUT, ZOOM, CATEGORIAS, DOMINIO, SITIO  # noqa: E402

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

    # Los originales no se suben a GitHub (están en .gitignore). Si en este equipo
    # falta alguno, se conserva la imagen ya generada en vez de romper el script.
    rel, slug, _ = HERO
    if (SRC / rel).exists():
        size, kb = guardar(cargar(rel), IMG / f"{slug}.webp", "hero")
        print(f"  portada    {slug:22s} {size[0]}x{size[1]} {kb:6.0f} KB")
    else:
        print(f"  portada    sin original ({rel}): se conserva la actual")

    rel, slug, _ = ABOUT
    if (SRC / rel).exists():
        size, kb = guardar(cargar(rel), IMG / f"{slug}.webp", "full")
        print(f"  retrato    {slug:22s} {size[0]}x{size[1]} {kb:6.0f} KB")
    else:
        print(f"  retrato    sin original ({rel}): se conserva el actual")

    formas = formas_desde_disco()     # las ya procesadas siguen en la galería
    total_kb = 0
    for rel, slug, cat, dest, titulo, alt in FOTOS:
        if not (SRC / rel).exists():
            if slug in formas:
                print(f"  =  {slug:22s} sin original: se conserva la ya procesada")
            else:
                print(f"  !! FALTA {rel}  ({slug} no estará en la galería)")
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


def inyectar(html, marca, contenido, sangria=8):
    patron = re.compile(rf"(<!-- {marca}:inicio -->).*?(<!-- {marca}:fin -->)", re.S)
    nuevo, n = patron.subn(lambda m: f"{m.group(1)}\n{contenido}\n{' ' * sangria}{m.group(2)}", html)
    if n != 1:
        raise SystemExit(f"ERROR: no encontré los marcadores {marca}:inicio/fin en index.html")
    return nuevo


def bloque_seo():
    """Etiquetas del <head> para Google y para la vista previa al compartir el enlace."""
    base = DOMINIO.rstrip("/")
    url = base + "/"
    imagen = f"{base}/{SITIO['imagen']}"
    titulo, desc = esc(SITIO["titulo"]), esc(SITIO["descripcion"])
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebSite", "@id": url + "#sitio", "url": url,
             "name": SITIO["nombre"], "alternateName": f"{SITIO['nombre']} Fotografía",
             "inLanguage": "es", "description": SITIO["descripcion"]},
            {"@type": "Person", "@id": url + "#persona", "name": SITIO["nombre"], "url": url,
             "jobTitle": SITIO["ocupacion"], "image": imagen, "sameAs": SITIO["perfiles"]},
        ],
    }
    # "</" dentro del JSON cerraría el <script> antes de tiempo.
    ld_txt = json.dumps(ld, ensure_ascii=False, indent=2).replace("</", "<\\/")
    ld_txt = "\n".join("    " + linea for linea in ld_txt.splitlines())
    lineas = [
        f'  <title>{titulo}</title>',
        f'  <meta name="description" content="{desc}" />',
        f'  <meta name="author" content="{esc(SITIO["nombre"])}" />',
        '  <meta name="robots" content="index, follow, max-image-preview:large" />',
        f'  <link rel="canonical" href="{url}" />',
        '',
        '  <link rel="icon" href="favicon.svg" type="image/svg+xml" />',
        '  <link rel="icon" href="favicon.ico" sizes="48x48" />',
        '  <link rel="apple-touch-icon" href="apple-touch-icon.png" />',
        '',
        '  <meta property="og:type" content="website" />',
        f'  <meta property="og:site_name" content="{esc(SITIO["nombre"])}" />',
        f'  <meta property="og:title" content="{titulo}" />',
        f'  <meta property="og:description" content="{desc}" />',
        f'  <meta property="og:url" content="{url}" />',
        f'  <meta property="og:image" content="{imagen}" />',
        '  <meta property="og:image:width" content="1200" />',
        '  <meta property="og:image:height" content="630" />',
        f'  <meta property="og:image:alt" content="{esc(SITIO["imagen_alt"])}" />',
        '  <meta property="og:locale" content="es_MX" />',
        '  <meta name="twitter:card" content="summary_large_image" />',
        f'  <meta name="twitter:title" content="{titulo}" />',
        f'  <meta name="twitter:description" content="{desc}" />',
        f'  <meta name="twitter:image" content="{imagen}" />',
        '',
        '  <script type="application/ld+json">',
        ld_txt,
        '  </script>',
    ]
    return "\n".join(lineas)


def construir_sitemap(formas):
    """sitemap.xml (la página + sus fotos, para Google Imágenes) y robots.txt."""
    base = DOMINIO.rstrip("/")
    fotos = "\n".join(
        f"    <image:image><image:loc>{base}/assets/img/full/{slug}.webp</image:loc></image:image>"
        for _, slug, *_ in FOTOS if slug in formas
    )
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
        '  <url>\n'
        f'    <loc>{base}/</loc>\n'
        f'    <lastmod>{datetime.date.today().isoformat()}</lastmod>\n'
        f'{fotos}\n'
        '  </url>\n'
        '</urlset>\n'
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8", newline="\n")
    robots = f"User-agent: *\nAllow: /\n\nSitemap: {base}/sitemap.xml\n"
    (ROOT / "robots.txt").write_text(robots, encoding="utf-8", newline="\n")


def construir_html(formas):
    """Inyecta los botones de filtro, las figuras y las etiquetas SEO entre los marcadores del HTML."""
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
        # Solo las astrofotos llevan descripción visible (objeto y exposición).
        pie = (f'\n              <figcaption class="gallery-caption">{esc(nota)}</figcaption>'
               if cat == "astro" and nota else '')
        figuras.append(f"""          <figure class="gallery-item" data-aspect="{formas[slug]}" data-category="{cat}"{destacada}>
            <button class="gallery-trigger" type="button" data-full="assets/img/full/{slug}.webp">
              <img class="gallery-img" src="assets/img/thumb/{slug}.webp" alt="{esc(alt)}" loading="lazy" decoding="async" />{pie}
            </button>
          </figure>""")

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = inyectar(html, "SEO", bloque_seo(), sangria=2)
    html = inyectar(html, "FILTROS", "\n".join(filtros))
    html = inyectar(html, "GALERIA", "\n\n".join(figuras))
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    construir_sitemap(formas)

    n_dest = sum(1 for f in FOTOS if f[3] and f[1] in formas)
    print(f"\n  HTML: {len(figuras)} fotos · {n_dest} destacadas")


if __name__ == "__main__":
    formas = formas_desde_disco() if "--solo-html" in sys.argv else construir_imagenes()
    construir_html(formas)
    print("\nListo.")
