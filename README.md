# Portafolio fotográfico

Sitio personal donde muestro las fotos que tomo: lo que me encuentro cuando
viajo y algo de astrofotografía.

🔗 **https://alonsovarela104.github.io/portafolio-fotografico/**

## Qué hice

Una galería de fotos, organizadas por país y por tema, con una pestaña de
Destacadas y un visor para abrir cada foto en grande.

Como eran demasiadas fotos para acomodarlas a mano, escribí un script en Python
que hace el trabajo pesado: corrige la orientación de las fotos del iPhone, las
convierte a WebP, genera dos tamaños (uno ligero para la galería y uno grande
para el visor) y arma la galería del HTML a partir de un catálogo. Así la página
carga rápido aunque tenga 90 fotos.

## Tecnologías

- HTML, CSS y JavaScript, sin frameworks ni build step
- GSAP + ScrollTrigger para las animaciones
- Lenis para el scroll suave
- Python (Pillow) para el procesamiento de imágenes
- GitHub Pages para el hosting

## Derechos

© Alonso Varela. Todas las fotografías son mías y no pueden usarse, copiarse ni
redistribuirse sin mi permiso. El código está publicado solo para consulta; no
se otorga licencia de uso.
