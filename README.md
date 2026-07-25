# Portafolio fotográfico

Sitio estático (HTML + CSS + JS, sin frameworks ni build step) listo para abrir
directamente o subir a cualquier hosting.

## Ver el sitio

- Doble clic en `index.html`, o
- `python3 -m http.server 8765` desde esta carpeta y abre `http://localhost:8765`

## Agregar o cambiar fotos

**Todo se controla desde un solo archivo: `tools/catalogo.py`.** La galería del
HTML se genera desde ahí; no la edites a mano (se sobrescribe).

Las fotos originales van en subcarpetas por categoría:

```
assets/photos/source/
├── mexico/
├── japon/
├── peru/
└── astro/
```

Para agregar una foto:

1. Cópiala a la subcarpeta que corresponda.
2. Añade una línea a la lista `FOTOS` de `tools/catalogo.py`:
   ```python
   ("mexico/IMG_1234.jpg", "mexico-mi-foto", "mexico", False,
    "El título que se ve sobre la foto",
    "Descripción para lectores de pantalla y buscadores"),
   ```
   El cuarto campo (`True`/`False`) indica si aparece en **Destacadas**.
3. Corre `python3 tools/build.py`.

Eso genera las imágenes y reescribe la galería dentro de `index.html`, entre
los marcadores `<!-- GALERIA:inicio -->` y `<!-- GALERIA:fin -->`.

Si solo cambiaste textos del catálogo (sin fotos nuevas):
`python3 tools/build.py --solo-html` — es mucho más rápido.

### Dos tamaños por foto

```
assets/img/thumb/<slug>.webp   →  la retícula (ligera, carga diferida)
assets/img/full/<slug>.webp    →  el visor ampliado (solo al hacer clic)
```

Con 90 fotos esto importa: si la retícula usara las grandes, recorrer la
galería descargaría más de 20 MB. Así la vista inicial son unos 1.6 MB, y de
esos solo se descarga lo que entra en pantalla.

### Qué hace el conversor (y por qué no uses uno cualquiera)

- **Respeta la orientación EXIF.** Las fotos del iPhone se guardan "de lado"
  con una etiqueta que indica cómo girarlas. Sin esto salen acostadas.
- **Recorta la barra de la app Seestar** en las astrofotos. Ojo: esos archivos
  salen a 1080 de ancho pero con alturas distintas (1920, 1935, 1964), así que
  la regla compara el ancho, no un tamaño exacto.
- **Centra los planetas** (`ZOOM` en el catálogo). Saturno y Júpiter salen como
  un punto diminuto y descentrado; el script busca el objeto brillante y recorta
  alrededor.
- **Comprime hasta entrar en presupuesto** (`PERFILES`), bajando calidad de a
  poco hasta llegar al peso objetivo.

### Proporciones de la retícula

`build.py` decide solo si cada foto es `wide` u `tall` según sus dimensiones.
La altura de fila del CSS (175px) está calculada para que una horizontal caiga
en una caja de ~3:2 y una vertical en ~3:4 — así se recorta poco (~5% en
Destacadas). Si cambias `grid-auto-rows`, revisa que siga cuadrando.

Para que el mosaico cierre sin huecos en Destacadas, la suma de columnas debe
ser múltiplo de 4 (cada horizontal ocupa 2, cada vertical 1). `build.py` te
avisa si no cuadra. En las vistas por categoría puede quedar un hueco al final;
es normal y no vale la pena forzarlo.

### Categorías

`mexico`, `japon`, `peru`, `astro`, más la pestaña **Destacadas** (que no es una
categoría: filtra por el campo `True` del catálogo). Para agregar un país o tema
nuevo, añádelo a `CATEGORIAS` y `ETIQUETA` en `tools/catalogo.py` y vuelve a
correr `build.py`.

## Personalizar

- **Nombre y textos**: directamente en `index.html` (nav, portada, "sobre mí").
- **Email y redes**: busca `tu@email.com` y `tu_usuario` en `index.html` y
  `lib/manifest.js`. **Están sin llenar todavía.**
- **Colores y tipografía**: `styles.css`, sección "1. Tokens" (`:root { ... }`).

## Animaciones

El sitio usa **GSAP + ScrollTrigger** y **Lenis** (smooth scroll), todos en
`lib/` — nada se carga de internet. Efectos activos:

- Reveals al hacer scroll y parallax sutil en la portada.
- Títulos que aparecen palabra por palabra (`data-split="words"`).
- Marquee (ticker) con los países, botones "magnéticos" y tilt 3D en las fotos.

Un detalle importante: Lenis **requiere** sus propias reglas de CSS (están en
`styles.css`, sección "Lenis"). La clave es `scroll-behavior: auto` — sin ella,
el smooth scroll nativo del navegador pelea con Lenis y el scroll se siente
pesado o se queda atorado. Si algún día quitas Lenis, quita también esas reglas.

En `lib/` también están **Anime.js** y **Motion** descargados pero **no
activados**. Los dejé disponibles por si quieres experimentar; cargar varios
motores de animación a la vez compite por el mismo bucle de render y es la
causa más común de que un sitio se sienta trabado.

## Publicar

El sitio pesa **~25 MB**. Las fotos originales (`assets/photos/source/`, ~394 MB)
están en `.gitignore` y **no** se suben: el sitio solo usa las versiones ya
convertidas de `assets/img/`. Guarda los originales aparte (disco externo,
iCloud) — si los pierdes, no puedes regenerar las imágenes.

Todas las rutas del sitio son relativas, así que funciona igual en la raíz de un
dominio o dentro de una subcarpeta.

### GitHub Pages

```bash
cd ~/Documents/portafolio-fotografico
git init
git add .
git commit -m "Portafolio fotográfico"
git branch -M main
git remote add origin https://github.com/alonsovarela104/portafolio-fotografico.git
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
En un par de minutos queda en
`https://alonsovarela104.github.io/portafolio-fotografico/`.

Para actualizar después de cambiar algo:

```bash
git add . && git commit -m "Actualizo fotos" && git push
```

### Los dos sitios en un mismo dominio

Sí se puede. Suponiendo `tudominio.com`:

**Opción A — subcarpeta** (la más simple, sin tocar DNS de más):
- Repo `alonsovarela104.github.io` → portafolio de programador → `tudominio.com`
- Repo `fotos` → este sitio → `tudominio.com/fotos`

GitHub Pages sirve los repos normales bajo la ruta de su nombre, y heredan el
dominio del sitio principal. Solo configuras el dominio una vez.

**Opción B — subdominio** (se ve más profesional):
- `tudominio.com` → portafolio de programador
- `fotos.tudominio.com` → este sitio

En este repo añades un archivo `CNAME` con `fotos.tudominio.com` dentro, y en tu
proveedor de dominio creas un registro CNAME de `fotos` apuntando a
`alonsovarela104.github.io`.

### Notas

- `.nojekyll` desactiva el procesado de Jekyll en GitHub Pages.
- `.htaccess` **solo funciona en hostings Apache** (Hostinger y similares); en
  GitHub Pages se ignora. No molesta, déjalo por si algún día te mudas.
- En GitHub Pages no puedes configurar cabeceras de caché, así que el
  `?v=` de `index.html` es lo que garantiza que el navegador tome los cambios:
  **súbelo cada vez que edites `styles.css` o `main.js`**.

Todas las fotografías del sitio son propias.
