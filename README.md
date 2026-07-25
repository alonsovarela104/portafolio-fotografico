# Portafolio fotográfico — Alonso Varela

Sitio personal donde muestro las fotos que tomo en mis viajes y algo de
astrofotografía.

🔗 **https://alonsovarela104.github.io/portafolio-fotografico/**

---

## Qué es

Una galería de 90 fotos organizadas por país (México, Japón, Perú) y por tema
(astrofotografía), con una pestaña de **Destacadas** con la selección que más me
gusta. Cada foto se puede abrir en grande.

## Con qué está hecho

- **HTML, CSS y JavaScript** puros — sin frameworks, sin build step
- **GSAP + ScrollTrigger** — animaciones al hacer scroll y el texto que aparece
  palabra por palabra
- **Lenis** — el scroll suave
- **Python (Pillow)** — un script propio que procesa las fotos: corrige la
  orientación, las convierte a WebP y genera dos tamaños (uno ligero para la
  galería y uno grande para ver la foto ampliada)
- **GitHub Pages** — el hosting

## Cómo agregar fotos

1. Copia las fotos a `assets/photos/source/` en la carpeta del país o tema.
2. Añade una línea por foto en `tools/catalogo.py`.
3. Corre `python3 tools/build.py` — genera las imágenes y actualiza la galería.
4. Súbelo a GitHub:

```bash
cd ~/Documents/portafolio-fotografico && git add . && git commit -m "Agrego fotos" && git push
```

> Si cambias `styles.css` o `main.js`, súbele el número a `?v=` en `index.html`
> (por ejemplo `?v=20260725d` → `?v=20260726`). Si no, los visitantes seguirán
> viendo la versión vieja guardada en su navegador.

Las fotos originales de la cámara (~394 MB) **no** se suben a GitHub: están en
`.gitignore`. Guárdalas aparte, porque sin ellas no se pueden regenerar las
imágenes del sitio.

---

## Derechos

© Alonso Varela. **Todas las fotografías de este sitio son mías y no pueden
usarse, copiarse ni redistribuirse sin mi permiso.**

El código se publica solo para que se pueda ver; no se otorga licencia de uso.
