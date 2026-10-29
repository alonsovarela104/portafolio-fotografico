(function () {
  "use strict";

  const root = document.documentElement;
  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fineHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const mod = (n, m) => ((n % m) + m) % m;

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }

  // Foto de fondo de cada filtro. "pos" es el punto de la foto que se queda
  // a la vista al recortarla para llenar la pantalla (object-position).
  const FONDOS = {
    destacadas: { src: "assets/img/hero.webp", pos: "50% 50%" },
    mexico:     { src: "assets/img/full/mexico-volcanes.webp", pos: "50% 60%" },
    japon:      { src: "assets/img/full/japon-fuji.webp", pos: "50% 56%" },
    peru:       { src: "assets/img/full/peru-humantay.webp", pos: "50% 60%" },
    astro:      { src: "assets/img/full/astro-luna-4.webp", pos: "50% 50%" },
  };

  // Generador pseudoaleatorio con semilla: la disposición de las fotos es
  // distinta de una foto a otra pero siempre igual entre visitas.
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // "destacadas" muestra solo las fotos marcadas con data-featured; los demás
  // filtros muestran todas las de esa categoría.
  function matchesFilter(item, filter) {
    if (filter === "destacadas") return item.hasAttribute("data-featured");
    if (filter === "all") return true;
    return item.dataset.category === filter;
  }

  // ---------------------------------------------------------------
  function initYear() {
    const el = $("[data-year]");
    if (el) el.textContent = new Date().getFullYear();
  }

  // ---------------------------------------------------------------
  // Fondo con fundido cruzado entre dos capas: la nueva foto se carga en la
  // capa de atrás y, cuando está lista, se funde sobre la de adelante.
  function initBackgrounds() {
    const stage = $(".stage-bg");
    const layers = $$("[data-bg-layer]", stage || document);
    if (!stage || layers.length < 2) return null;

    let front = 0;
    let currentSrc = FONDOS.destacadas.src;
    let token = 0;
    const heroAlt = layers[0].alt;

    const altOf = src => {
      const slug = src.split("/").pop().replace(/\.webp$/, "");
      const thumb = $('.gallery-item img[src$="/thumb/' + slug + '.webp"]');
      return thumb ? thumb.alt : "";
    };

    function show(key) {
      const f = FONDOS[key] || FONDOS.destacadas;
      if (f.src === currentSrc) return;
      currentSrc = f.src;
      const mine = ++token;
      const back = layers[1 - front];
      let done = false;
      const swap = () => {
        if (done || mine !== token) return;
        done = true;
        back.classList.add("is-on");
        layers[front].classList.remove("is-on");
        layers[front].alt = "";
        front = 1 - front;
      };
      back.alt = f.src === FONDOS.destacadas.src ? heroAlt : altOf(f.src);
      back.style.objectPosition = f.pos;
      back.onload = swap;
      back.src = f.src;
      if (back.complete && back.naturalWidth) swap();
    }

    // Se precarga al pasar el cursor por el filtro, para que el cambio sea inmediato.
    function preload(key) {
      const f = FONDOS[key];
      if (f) new Image().src = f.src;
    }

    return { show, preload, stage };
  }

  // ---------------------------------------------------------------
  // Lienzo infinito. Cada foto tiene una posición base dentro de un "periodo"
  // (PW x PH) y se dibuja en la copia más cercana a la pantalla: al arrastrar,
  // lo que sale por un borde reaparece por el opuesto, así nunca se acaba.
  function initCanvas() {
    const canvas = $("[data-canvas]");
    const items = $$(".gallery-item");
    if (!canvas || !items.length) return;

    root.classList.add("is-canvas");

    const buttons = $$(".filter-btn");
    const countEl = $("[data-count]");
    const bgs = initBackgrounds();
    const recs = new Map();
    const s = {
      tx: 0, ty: 0,                  // posición objetivo
      cx: 0, cy: 0,                  // posición dibujada
      vx: 0, vy: 0,                  // inercia (px/s)
      dragging: false, raf: 0, last: 0,
      time: 0,                       // reloj del vaivén
      drift: 0,                      // deriva automática: intensidad (0-1)
      px: 0, py: 0, tpx: 0, tpy: 0,  // paralaje con el puntero (actual y objetivo)
    };
    const DRIFT_SPEED = 38;          // px por segundo
    const DRIFT_ANGLE = Math.PI + 0.3;  // dirección fija: hacia la izquierda y un poco hacia arriba
    let active = [];
    let PW = 1, PH = 1, MX = 0, MY = 0, VW = 0, VH = 0;

    // Las miniaturas aparecen con fundido cuando terminan de cargar.
    $$(".gallery-img").forEach(img => {
      const show = () => img.classList.add("is-loaded");
      if (img.complete && img.naturalWidth) show();
      else { img.addEventListener("load", show, { once: true }); img.addEventListener("error", show, { once: true }); }
    });

    function layout() {
      VW = canvas.clientWidth;
      VH = canvas.clientHeight;
      active = items.filter(el => !el.classList.contains("is-hidden"));
      recs.clear();
      const n = active.length;
      if (countEl) countEl.textContent = n + (n === 1 ? " foto" : " fotos");
      if (!n) return;

      const rand = mulberry32(20261028);
      const u = Math.min(230, Math.max(120, VW * 0.135));   // unidad de tamaño
      MX = MY = u * 0.83 + 24;                             // margen para que el salto no se vea
      const cellW = u * 1.9, cellH = u * 1.75;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * cellH / cellW)));
      const rows = Math.ceil(n / cols);
      // El periodo nunca puede ser menor que la pantalla, o se verían huecos.
      PW = Math.max(cols * cellW, VW + 2 * MX);
      PH = Math.max(rows * cellH, VH + 2 * MY);
      const cw = PW / cols, ch = PH / rows;

      const cells = shuffle(Array.from({ length: cols * rows }, (_, i) => i), rand);
      const list = [];
      shuffle(active.slice(), rand).forEach((el, i) => {
        const col = cells[i] % cols, row = Math.floor(cells[i] / cols);
        // "depth" no cambia la velocidad (todas se mueven juntas, así el
        // solapamiento no crece al arrastrar): solo el tamaño, la sombra, qué
        // foto queda encima y cuánto se mueve con el puntero.
        const depth = 0.92 + rand() * 0.16;
        const near = (depth - 0.92) / 0.16;                  // 0 = lejos, 1 = cerca
        const k = 0.88 + near * 0.24;                        // más cerca = más grande
        const wide = el.dataset.aspect === "wide";
        const w = (wide ? 1.35 : 0.95) * u * k;
        const h = wide ? w / 1.5 : w / 0.75;
        const rot = (rand() < 0.5 ? -1 : 1) * (1.5 + rand() * 5.5);
        const bx = (col + 0.5) * cw + (rand() - 0.5) * cw * 0.6;
        const by = (row + 0.5) * ch + (rand() - 0.5) * ch * 0.6;
        el.style.width = w.toFixed(1) + "px";
        el.style.height = h.toFixed(1) + "px";
        el.style.setProperty("--rot", rot.toFixed(2) + "deg");
        el.style.setProperty("--z", String(Math.round(depth * 100)));
        el.style.setProperty("--dp", (0.7 + near * 0.8).toFixed(2));
        const r = { el, bx, by, rot, w, h, ph: rand() * 6.283, par: (near - 0.5) * 18 };
        recs.set(el, r);
        list.push(r);
      });
      relax(list);
    }

    // Separa las fotos hasta que no se tapen. Usa la caja real de cada foto
    // (ya inclinada) más una holgura para el vaivén y el paralaje, y trata el
    // periodo como un toro: lo que sale por un borde reaparece por el
    // contrario, así que las distancias también "dan la vuelta".
    function relax(list) {
      const PAD = 10;
      const MAX = 0.04;               // fracción de la foto más chica que puede quedar tocada
      const wrap = (d, P) => mod(d + P / 2, P) - P / 2;
      const ext = list.map(r => {
        const a = (Math.abs(r.rot) + 1.5) * Math.PI / 180;   // incluye el balanceo
        const c = Math.cos(a), sn = Math.sin(a);
        return { hw: (r.w * c + r.h * sn) / 2 + PAD, hh: (r.h * c + r.w * sn) / 2 + PAD };
      });
      for (let pass = 0; pass < 400; pass++) {
        let moved = false;
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i], b = list[j], ea = ext[i], eb = ext[j];
            const dx = wrap(b.bx - a.bx, PW), dy = wrap(b.by - a.by, PH);
            const ox = ea.hw + eb.hw - Math.abs(dx), oy = ea.hh + eb.hh - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            const menor = Math.min(4 * ea.hw * ea.hh, 4 * eb.hw * eb.hh);
            if (ox * oy <= MAX * menor) continue;
            moved = true;
            // Empujar en el eje donde el traslape es menor (el camino más corto).
            if (ox < oy) {
              const p = ox * 0.3 * (dx < 0 ? -1 : 1);
              a.bx -= p; b.bx += p;
            } else {
              const p = oy * 0.3 * (dy < 0 ? -1 : 1);
              a.by -= p; b.by += p;
            }
          }
        }
        if (!moved) break;
      }
      list.forEach(r => { r.bx = mod(r.bx, PW); r.by = mod(r.by, PH); });
    }

    function render() {
      const t = s.time;
      for (const el of active) {
        const r = recs.get(el);
        // Vaivén suave de cada foto (acotado, no se acumula) + paralaje con el puntero.
        const sx = reduced ? 0 : Math.sin(t * 0.45 + r.ph) * 4;
        const sy = reduced ? 0 : Math.cos(t * 0.38 + r.ph * 1.7) * 4;
        const sr = reduced ? 0 : Math.sin(t * 0.3 + r.ph * 2.3) * 1.4;
        const x = mod(r.bx + s.cx + MX, PW) - MX + sx + s.px * r.par;
        const y = mod(r.by + s.cy + MY, PH) - MY + sy + s.py * r.par;
        el.style.transform =
          "translate3d(" + (x - r.w / 2).toFixed(1) + "px," + (y - r.h / 2).toFixed(1) + "px,0) rotate(" + (r.rot + sr).toFixed(2) + "deg)";
      }
    }

    function kick() {
      if (s.raf) return;
      s.last = performance.now();
      s.raf = requestAnimationFrame(tick);
    }

    // Todo el movimiento (arrastre, inercia y deriva) se suma directo a la
    // posición dibujada: sin suavizado de por medio no hay "tirón" al soltar.
    // Solo la rueda, el teclado y el enfoque mueven el objetivo y dejan que la
    // posición dibujada lo alcance poco a poco.
    function tick(now) {
      s.raf = 0;
      // Con un panel o el visor abierto no hay nada que animar debajo.
      if ($("dialog[open]")) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - s.last) / 1000));
      s.last = now;

      let mx = 0, my = 0;
      if (!s.dragging && (s.vx || s.vy)) {          // inercia al soltar
        mx += s.vx * dt;
        my += s.vy * dt;
        const decay = Math.pow(0.05, dt);
        s.vx *= decay; s.vy *= decay;
        if (Math.abs(s.vx) < 6) s.vx = 0;
        if (Math.abs(s.vy) < 6) s.vy = 0;
      }

      if (!reduced) {
        // La deriva se mezcla de inmediato al soltar (sin esperas): entra en
        // ~0.3 s mientras la inercia se apaga, así el movimiento nunca se corta.
        s.drift += ((s.dragging ? 0 : 1) - s.drift) * (1 - Math.pow(0.02, dt));
        const step = DRIFT_SPEED * s.drift * dt;
        mx += Math.cos(DRIFT_ANGLE) * step;
        my += Math.sin(DRIFT_ANGLE) * step;
        s.time += dt;
        const kp = 1 - Math.pow(0.002, dt);
        s.px += (s.tpx - s.px) * kp;
        s.py += (s.tpy - s.py) * kp;
      }

      s.tx += mx; s.cx += mx;
      s.ty += my; s.cy += my;

      const k = reduced ? 1 : 1 - Math.pow(1 - 0.14, dt * 60);
      s.cx += (s.tx - s.cx) * k;
      s.cy += (s.ty - s.cy) * k;
      const settled = Math.abs(s.tx - s.cx) < 0.05 && Math.abs(s.ty - s.cy) < 0.05;
      if (settled) { s.cx = s.tx; s.cy = s.ty; }
      render();
      // Sin movimiento reducido el lienzo nunca se detiene del todo (deriva y vaivén).
      if (!reduced || !settled || s.vx || s.vy || s.dragging) kick();
    }

    function resetPosition() {
      s.tx = s.ty = s.cx = s.cy = s.vx = s.vy = 0;
    }

    function intro() {
      if (reduced) { active.forEach(el => el.classList.add("is-in")); return; }
      active.forEach(el => {
        el.classList.remove("is-in");
        el.style.setProperty("--d", (Math.random() * 0.75).toFixed(2) + "s");
      });
      void canvas.offsetWidth;
      requestAnimationFrame(() => active.forEach(el => el.classList.add("is-in")));
    }

    function applyFilter(filter, animate) {
      buttons.forEach(b => {
        const on = b.dataset.filter === filter;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      if (bgs) bgs.show(filter);
      const run = () => {
        items.forEach(el => el.classList.toggle("is-hidden", !matchesFilter(el, filter)));
        resetPosition();
        layout();
        render();
        canvas.classList.remove("is-leaving");
        intro();
      };
      if (animate && !reduced) {
        canvas.classList.add("is-leaving");
        setTimeout(run, 240);
      } else {
        run();
      }
    }

    buttons.forEach(b => {
      b.addEventListener("click", () => applyFilter(b.dataset.filter, true));
      if (bgs) {
        b.addEventListener("pointerenter", () => bgs.preload(b.dataset.filter));
        b.addEventListener("focus", () => bgs.preload(b.dataset.filter));
      }
    });
    $$("[data-home]").forEach(el => el.addEventListener("click", e => {
      e.preventDefault();
      $$("dialog[open]").forEach(d => d.close());
      resetPosition();
      render();
      intro();
    }));

    function markMoved() { root.classList.add("has-moved"); }

    // --- Arrastre con ratón o dedo ---
    // Un "clic" es cualquier toque que termine a menos de CLICK_TOL píxeles de
    // donde empezó. La mano (o el ratón) siempre se mueve un poco al pulsar, así
    // que no se puede exigir quietud total: se mide el desplazamiento neto, no el
    // recorrido acumulado.
    const CLICK_TOL = 10;
    let drag = null;

    canvas.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = {
        id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
        t: performance.now(), far: false,
        item: e.target.closest && e.target.closest(".gallery-item"),
      };
      s.dragging = true;
      s.vx = s.vy = 0;
      canvas.classList.add("is-dragging");
      kick();
    });

    window.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const dt = Math.max(1, now - drag.t) / 1000;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
      if (!drag.far && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > CLICK_TOL) {
        drag.far = true;
        markMoved();
      }
      // El contenido sigue al puntero sin retraso.
      s.tx += dx; s.cx += dx;
      s.ty += dy; s.cy += dy;
      s.vx = Math.max(-4000, Math.min(4000, s.vx * 0.5 + (dx / dt) * 0.5));
      s.vy = Math.max(-4000, Math.min(4000, s.vy * 0.5 + (dy / dt) * 0.5));
      kick();
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      s.dragging = false;
      canvas.classList.remove("is-dragging");
      // Si el puntero se quedó quieto antes de soltar, no hay inercia.
      if (performance.now() - d.t > 100 || reduced) s.vx = s.vy = 0;
      if (e.type === "pointerup" && !d.far && d.item) {
        document.dispatchEvent(new CustomEvent("photo:open", { detail: { item: d.item } }));
      }
      kick();
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    // Los clics de ratón/dedo ya los resolvió endDrag; solo se deja pasar el
    // que viene del teclado (Enter/Espacio sobre una foto enfocada).
    canvas.addEventListener("click", e => {
      if (e.detail !== 0) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    // --- Rueda / trackpad ---
    canvas.addEventListener("wheel", e => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? VH : 1;
      s.tx -= e.deltaX * m;
      s.ty -= e.deltaY * m;
      markMoved();
      kick();
    }, { passive: false });

    // Al cerrar un panel o el visor se reanuda la animación.
    document.addEventListener("close", kick, true);

    // --- Teclado ---
    window.addEventListener("keydown", e => {
      if ($("dialog[open]")) return;
      const step = e.shiftKey ? 420 : 170;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const mv = moves[e.key];
      if (!mv) return;
      e.preventDefault();
      s.tx += mv[0]; s.ty += mv[1];
      markMoved();
      kick();
    });

    // Con Tab, centrar la foto enfocada (puede estar fuera de pantalla).
    canvas.addEventListener("focusin", e => {
      const item = e.target.closest && e.target.closest(".gallery-item");
      const r = item && recs.get(item);
      if (!r || !e.target.matches(":focus-visible")) return;
      const x = mod(r.bx + s.cx + MX, PW) - MX;
      const y = mod(r.by + s.cy + MY, PH) - MY;
      s.tx += VW / 2 - x;
      s.ty += VH / 2 - y;
      markMoved();
      kick();
    });

    // Paralaje con el puntero: el fondo y las fotos se desplazan un poco, cada
    // una según su "profundidad". Es un desplazamiento acotado, no se acumula.
    if (fineHover && !reduced) {
      window.addEventListener("pointermove", e => {
        s.tpx = e.clientX / innerWidth - 0.5;
        s.tpy = e.clientY / innerHeight - 0.5;
        if (bgs) {
          bgs.stage.style.setProperty("--bx", (s.tpx * -16).toFixed(1) + "px");
          bgs.stage.style.setProperty("--by", (s.tpy * -12).toFixed(1) + "px");
        }
      }, { passive: true });
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { layout(); render(); }, 150);
    });

    const inicial = ($(".filter-btn.is-active") || buttons[0] || { dataset: { filter: "all" } }).dataset.filter;
    applyFilter(inicial, false);
    kick();
  }

  // ---------------------------------------------------------------
  function initPanels() {
    $$("[data-panel-open]").forEach(btn => btn.addEventListener("click", () => {
      const dlg = $('[data-panel="' + btn.dataset.panelOpen + '"]');
      if (!dlg) return;
      $$("dialog.panel[open]").forEach(d => { if (d !== dlg) d.close(); });
      if (!dlg.open) dlg.showModal();
    }));
    $$("dialog.panel").forEach(dlg => {
      const close = $("[data-panel-close]", dlg);
      if (close) close.addEventListener("click", () => dlg.close());
      // Clic en el fondo oscuro (fuera del panel) lo cierra.
      dlg.addEventListener("click", e => {
        const r = dlg.getBoundingClientRect();
        const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!dentro) dlg.close();
      });
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
    let loadToken = 0;

    // Recibe la <figure> y busca su posición dentro de las visibles. Usar el
    // índice global rompería la navegación cuando hay un filtro activo.
    function open(item) {
      if (dialog.open) return;
      visibleItems = $$(".gallery-item").filter(el => !el.classList.contains("is-hidden"));
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
      const full = (trigger && trigger.dataset.full) || "";
      const cap = $(".gallery-caption", item);   // solo las astrofotos tienen
      caption.textContent = cap ? cap.textContent.trim() : "";
      img.alt = thumb.alt;
      // La miniatura (ya cargada) se muestra de inmediato; la versión grande se
      // descarga aparte y la reemplaza al terminar. Si la grande fallara, se
      // queda la miniatura en vez de un icono de imagen rota.
      const mine = ++loadToken;
      img.src = thumb.currentSrc || thumb.src;
      if (!full) return;
      const big = new Image();
      big.onload = () => { if (mine === loadToken) img.src = full; };
      big.src = full;
    }

    function step(delta) {
      if (!visibleItems.length) return;
      currentIndex = (currentIndex + delta + visibleItems.length) % visibleItems.length;
      render();
    }

    // Ratón/dedo en el lienzo: lo avisa initCanvas. Teclado o sin lienzo: clic normal.
    document.addEventListener("photo:open", e => open(e.detail.item));
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

    // Deslizar con el dedo para pasar a la foto anterior o siguiente.
    let sx = null, sy = null;
    dialog.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" || e.target.closest("button")) return;
      sx = e.clientX; sy = e.clientY;
    });
    dialog.addEventListener("pointerup", e => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = sy = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    });
    dialog.addEventListener("pointercancel", () => { sx = sy = null; });
  }

  // ---------------------------------------------------------------
  function boot() {
    safe(initYear, "initYear");
    try {
      initCanvas();
    } catch (e) {
      // Si el lienzo falla, la galería se queda como retícula normal.
      console.warn("[initCanvas]", e);
      root.classList.remove("is-canvas");
    }
    safe(initPanels, "initPanels");
    safe(initLightbox, "initLightbox");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
