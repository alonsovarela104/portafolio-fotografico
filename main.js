(function () {
  "use strict";

  const data = window.__BRAND__ || {};
  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fineHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }

  // ---------------------------------------------------------------
  function initYear() {
    const el = $("[data-year]");
    if (el) el.textContent = data.year || new Date().getFullYear();
  }

  // ---------------------------------------------------------------
  function initNav() {
    const nav = $("[data-nav]");
    if (!nav) return;
    const toggle = $("[data-nav-toggle]", nav);
    const menu = $("[data-nav-menu]", nav);

    const onScroll = () => nav.classList.toggle("is-scrolled", scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        const open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
      });
      $$("a", menu).forEach(a => a.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }));
    }
  }

  // ---------------------------------------------------------------
  function initReveals() {
    const els = $$("[data-reveal]");
    if (!els.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("is-revealed");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -2% 0px" });
    els.forEach(el => io.observe(el));

    // Safety net: reveal anything still hidden after 6s
    setTimeout(() => {
      els.forEach(el => {
        if (!el.classList.contains("is-revealed") && el.getBoundingClientRect().top < innerHeight) {
          el.classList.add("is-revealed");
        }
      });
    }, 6000);
  }

  // ---------------------------------------------------------------
  // "destacadas" es la vista por defecto: muestra solo las fotos marcadas con
  // data-featured. Los demás filtros muestran todas las de esa categoría.
  function matchesFilter(item, filter) {
    if (filter === "destacadas") return item.hasAttribute("data-featured");
    if (filter === "all") return true;
    return item.dataset.category === filter;
  }

  function initGalleryFilter() {
    const items = $$(".gallery-item");
    const buttons = $$(".filter-btn");
    if (!buttons.length || !items.length) return;

    function apply(filter) {
      buttons.forEach(b => {
        const on = b.dataset.filter === filter;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      items.forEach(item => {
        item.classList.toggle("is-hidden", !matchesFilter(item, filter));
      });
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }

    buttons.forEach(btn => btn.addEventListener("click", () => apply(btn.dataset.filter)));

    // Estado inicial: lo que venga marcado como activo en el HTML.
    const inicial = ($(".filter-btn.is-active") || buttons[0]).dataset.filter;
    apply(inicial);
  }

  // ---------------------------------------------------------------
  function initTilt() {
    if (!fineHover) return;
    $$(".gallery-trigger").forEach(card => {
      const MAX = 6;
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
      card.style.transformStyle = "preserve-3d";

      card.addEventListener("mousemove", e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        tx = -py * MAX; ty = px * MAX;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      card.addEventListener("mouseleave", () => {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      function loop() {
        cx += (tx - cx) * 0.15;
        cy += (ty - cy) * 0.15;
        card.style.transform = `perspective(900px) rotateX(${cx.toFixed(2)}deg) rotateY(${cy.toFixed(2)}deg)`;
        raf = (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) ? requestAnimationFrame(loop) : null;
      }
    });
  }

  // ---------------------------------------------------------------
  function initLightbox() {
    const dialog = $("[data-lightbox]");
    if (!dialog || typeof dialog.showModal !== "function") return;
    const img = $("[data-lightbox-img]", dialog);
    const caption = $("[data-lightbox-caption]", dialog);
    let visibleItems = [];
    let currentIndex = 0;

    function getVisibleItems() {
      return $$(".gallery-item").filter(el => !el.classList.contains("is-hidden"));
    }

    // Recibe la <figure> y busca su posición dentro de las visibles. Usar el
    // índice global rompería la navegación cuando hay un filtro activo.
    function open(item) {
      visibleItems = getVisibleItems();
      const i = visibleItems.indexOf(item);
      if (i === -1) return;
      currentIndex = i;
      render();
      dialog.showModal();
    }

    function render() {
      const item = visibleItems[currentIndex];
      if (!item) return;
      const thumb = $("img", item);
      const trigger = $(".gallery-trigger", item);
      // La retícula usa miniaturas; el visor carga la versión grande.
      img.src = (trigger && trigger.dataset.full) || thumb.src;
      img.alt = thumb.alt;
      caption.textContent = $(".gallery-caption", item).textContent.trim();
    }

    function step(delta) {
      if (!visibleItems.length) return;
      currentIndex = (currentIndex + delta + visibleItems.length) % visibleItems.length;
      render();
    }

    $$(".gallery-trigger").forEach(trigger => {
      trigger.addEventListener("click", () => open(trigger.closest(".gallery-item")));
    });

    const closeBtn = $("[data-lightbox-close]", dialog);
    const prevBtn = $("[data-lightbox-prev]", dialog);
    const nextBtn = $("[data-lightbox-next]", dialog);
    if (closeBtn) closeBtn.addEventListener("click", () => dialog.close());
    if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => step(1));

    dialog.addEventListener("click", e => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
  }

  // ---------------------------------------------------------------
  function initHeroParallax() {
    if (!window.gsap || !window.ScrollTrigger || reduced) return;
    const heroImg = $("[data-hero-img]");
    if (!heroImg) return;
    gsap.to(heroImg, {
      yPercent: 12,
      scale: 1.08,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
  }

  // ---------------------------------------------------------------
  // Smooth scroll (Lenis). Native scroll-behavior:smooth stays as a
  // CSS fallback; this only takes over when the library loads fine.
  function initLenis() {
    if (!window.Lenis) return;
    const lenis = new window.Lenis({
      lerp: reduced ? 1 : 0.1,   // lerp (not duration) — correct for continuous wheel input
      smoothWheel: !reduced,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });
    window.__lenis = lenis;

    if (window.gsap) {
      gsap.ticker.add(time => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      if (window.ScrollTrigger) lenis.on("scroll", ScrollTrigger.update);
    } else {
      requestAnimationFrame(function raf(time) { lenis.raf(time); requestAnimationFrame(raf); });
    }
  }

  function initSmoothAnchors() {
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      if (window.__lenis) window.__lenis.scrollTo(el, { offset: -72, duration: 1.2 });
      else el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
  }

  // ---------------------------------------------------------------
  // Split-text reveal — iterates childNodes so <br>/<em> survive.
  function splitWords(el) {
    el.setAttribute("aria-label", el.textContent.trim().replace(/\s+/g, " "));
    const wrap = text => text.split(/(\s+)/).map(w =>
      /^\s+$/.test(w) ? w : `<span class="split-word"><span class="split-word-inner">${escHTML(w)}</span></span>`
    ).join("");
    const html = Array.from(el.childNodes).map(node => {
      if (node.nodeType === 3) return wrap(node.textContent);
      if (node.nodeName === "BR") return "<br>";
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        return `<${tag}>${wrap(node.textContent)}</${tag}>`;
      }
      return "";
    }).join("");
    el.innerHTML = html;
    return $$(".split-word-inner", el);
  }
  function escHTML(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function initSplitText() {
    const targets = $$("[data-split]");
    if (!targets.length) return;
    targets.forEach(el => {
      const words = splitWords(el);
      if (!window.gsap) return; // words already readable via CSS fallback below
      gsap.set(words, { yPercent: 110 });
      const tween = () => gsap.to(words, {
        yPercent: 0, duration: 0.9, ease: "expo.out", stagger: 0.045,
      });
      if (window.ScrollTrigger && !el.closest(".hero")) {
        ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: tween });
      } else {
        tween();
      }
    });
  }

  // ---------------------------------------------------------------
  function initMagnetic() {
    if (!fineHover) return;
    $$("[data-magnetic]").forEach(el => {
      const strength = parseFloat(el.dataset.magnetic) || 0.3;
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
      el.addEventListener("mousemove", e => {
        const r = el.getBoundingClientRect();
        tx = ((e.clientX - r.left) - r.width / 2) * strength;
        ty = ((e.clientY - r.top) - r.height / 2) * strength;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      el.addEventListener("mouseleave", () => {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      function loop() {
        cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
        el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
        raf = (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) ? requestAnimationFrame(loop) : null;
      }
    });
  }

  // ---------------------------------------------------------------
  // Marquee sin costuras: repite los elementos hasta que una copia sea más
  // ancha que la pantalla, luego duplica esa copia y anima -50%. Sin esto,
  // el contenido (unas pocas palabras) es más corto que el viewport y al
  // desplazarse deja un hueco vacío — se ve entrecortado.
  function initMarquee() {
    const track = $("[data-marquee]");
    if (!track) return;
    const marquee = track.closest(".marquee");
    if (!marquee) return;

    const base = track.innerHTML;
    let viewport = $(".marquee-viewport", marquee);
    if (!viewport) {
      viewport = document.createElement("div");
      viewport.className = "marquee-viewport";
      marquee.appendChild(viewport);
      viewport.appendChild(track);
    }

    let anchoUsado = 0;

    function build() {
      // clientWidth puede ser 0 si el elemento aún no tiene layout (o está en
      // una pestaña oculta). Con objetivo 0 no se repetiría nada y volvería el
      // hueco, así que se toma un mínimo razonable.
      const objetivo = Math.max(marquee.clientWidth, window.innerWidth || 0, 1440);
      anchoUsado = objetivo;

      viewport.classList.remove("is-animated");
      $$(".marquee-track", viewport).slice(1).forEach(n => n.remove());
      track.innerHTML = base;

      let guardas = 0;
      while (track.scrollWidth < objetivo && guardas++ < 40) {
        track.insertAdjacentHTML("beforeend", base);
      }
      const copia = track.cloneNode(true);
      copia.removeAttribute("data-marquee");
      copia.setAttribute("aria-hidden", "true");
      viewport.appendChild(copia);

      // Duración proporcional al ancho, para que la velocidad se perciba igual
      // en móvil y en escritorio (~55 px por segundo).
      viewport.style.animationDuration = Math.max(18, track.scrollWidth / 55) + "s";
      viewport.classList.add("is-animated");
    }

    build();

    // Rehacer si el ancho real cambia de forma notable (incluye el caso de
    // aparecer con ancho 0 y recibir su tamaño definitivo después).
    let t;
    const rehacer = () => { clearTimeout(t); t = setTimeout(build, 200); };
    window.addEventListener("resize", rehacer);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(entries => {
        const w = entries[0].contentRect.width;
        if (w > 0 && Math.abs(w - anchoUsado) > 40) rehacer();
      }).observe(marquee);
    }
  }

  // ---------------------------------------------------------------
  function boot() {
    safe(initYear, "initYear");
    safe(initNav, "initNav");
    safe(initReveals, "initReveals");
    safe(initGalleryFilter, "initGalleryFilter");
    safe(initTilt, "initTilt");
    safe(initLightbox, "initLightbox");
    safe(initMagnetic, "initMagnetic");
    safe(initMarquee, "initMarquee");
    safe(initSmoothAnchors, "initSmoothAnchors");
    safe(initLenis, "initLenis");

    if (window.gsap && window.ScrollTrigger) {
      try { gsap.registerPlugin(ScrollTrigger); } catch (_) {}
      safe(initHeroParallax, "initHeroParallax");
    }
    safe(initSplitText, "initSplitText");

    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
