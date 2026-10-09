// Decorative only: bounded particles stay in the gutters, away from readable content.
(() => {
  const canvas = document.getElementById("season-canvas");
  const button = document.getElementById("motion-toggle");
  if (!canvas || !button) return;
  const context = canvas.getContext("2d");
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const month = new Date().getMonth();
  const season = [9, 10].includes(month)
    ? "autumn"
    : [11, 0, 1].includes(month)
      ? "winter"
      : "none";
  const leaf = new Image();
  leaf.src = "assets/icon-leaf.svg";
  const particles = [];
  const settled = [];
  let permitted = true;
  try {
    permitted = localStorage.getItem("guteneo.status.motion") !== "off";
  } catch {
    /* Storage is optional. */
  }
  let width = 0,
    height = 0,
    gutter = 0,
    ratio = 1,
    frame = 0,
    previous = 0,
    elapsed = 0,
    geometryAt = 0;
  let boxes = [];
  const enabled = () => permitted && !preference.matches;
  function resize() {
    width = innerWidth;
    height = innerHeight;
    const bounds = document.querySelector("main.wrap").getBoundingClientRect();
    gutter = Math.max(5, Math.min(70, bounds.left - 3));
    ratio = Math.min(
      devicePixelRatio || 1,
      1.5,
      Math.sqrt(2000000 / Math.max(1, width * height)),
    );
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    geometryAt = 0;
  }
  function spawn() {
    const size = season === "autumn" ? Math.min(13, gutter - 2) : 3;
    return {
      side: Math.random() < 0.5 ? 0 : 1,
      offset: 3 + Math.random() * Math.max(1, gutter - size - 3),
      y: -20 - Math.random() * height,
      size,
      speed: 12 + Math.random() * 16,
      turn: Math.random() * Math.PI * 2,
    };
  }
  function xFor(p) {
    return p.side ? width - p.offset - p.size : p.offset;
  }
  function paintLeaf(p, y, rotation) {
    if (!leaf.complete || !leaf.naturalWidth) return;
    context.save();
    context.translate(xFor(p) + p.size / 2, y + p.size / 2);
    context.rotate(rotation);
    context.globalAlpha = 0.46;
    context.drawImage(leaf, -p.size / 2, -p.size / 2, p.size, p.size);
    context.restore();
  }
  function render(now) {
    frame = 0;
    if (!enabled() || document.hidden || season === "none" || !context) return;
    if (now - previous < 40) {
      frame = requestAnimationFrame(render);
      return;
    }
    const delta = Math.min(80, previous ? now - previous : 40) / 1000;
    previous = now;
    elapsed += delta;
    context.clearRect(0, 0, width, height);
    if (now - geometryAt > 500) {
      boxes = [
        ...document.querySelectorAll(
          ".overview,.history-panel,.results,.evidence-register,.operation-list",
        ),
      ]
        .filter((el) => el.getClientRects().length)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.top > 6 && r.top < height);
      geometryAt = now;
    }
    // A shallow cap above the outer border never covers the box contents.
    if (season === "winter") {
      const depth = Math.min(6, elapsed / 12);
      context.fillStyle = "#dbe7f4";
      for (const r of boxes) {
        context.beginPath();
        context.roundRect(
          r.left + 3,
          r.top - depth,
          Math.max(0, r.width - 6),
          depth,
          [4, 4, 0, 0],
        );
        context.fill();
      }
    }
    for (const p of particles) {
      p.y += p.speed * delta;
      if (p.y > height - p.size - 2) {
        if (season === "autumn") {
          if (settled.length === 12) settled.shift();
          settled.push({ ...p, y: height - p.size - 2 - Math.random() * 7 });
        }
        Object.assign(p, spawn());
        p.y = -20;
      }
      if (season === "autumn")
        paintLeaf(p, p.y, p.turn + Math.sin(elapsed / 2 + p.turn) * 0.45);
      else {
        context.fillStyle = "#7f9ed5";
        context.globalAlpha = 0.65;
        context.beginPath();
        context.arc(xFor(p), p.y, 1.6, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }
    for (const p of settled)
      paintLeaf(p, height - p.size - 2 - (p.y % 7), p.turn);
    canvas.dataset.particles = String(particles.length + settled.length);
    frame = requestAnimationFrame(render);
  }
  function reconcile() {
    const active = enabled();
    document.body.classList.toggle("effects-off", !active);
    document.body.classList.toggle("effects-paused", document.hidden);
    button.setAttribute("aria-pressed", String(active));
    button.textContent = preference.matches
      ? "Animations : mouvement réduit"
      : "Animations : " + (active ? "activées" : "désactivées");
    button.disabled = preference.matches;
    canvas.dataset.season = season;
    canvas.dataset.running = String(
      active && !document.hidden && season !== "none",
    );
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (!active) {
      context?.clearRect(0, 0, width, height);
      settled.length = 0;
      elapsed = 0;
    }
    if (active && !document.hidden && season !== "none" && context) {
      if (!particles.length)
        for (let i = 0; i < 12; i++) particles.push(spawn());
      frame = requestAnimationFrame(render);
    }
    canvas.dataset.particles = String(particles.length + settled.length);
  }
  button.addEventListener("click", () => {
    permitted = !permitted;
    try {
      localStorage.setItem("guteneo.status.motion", permitted ? "on" : "off");
    } catch {
      /* Keep the choice for this visit. */
    }
    reconcile();
  });
  preference.addEventListener("change", reconcile);
  document.addEventListener("visibilitychange", reconcile);
  addEventListener("resize", resize, { passive: true });
  addEventListener(
    "scroll",
    () => {
      geometryAt = 0;
    },
    { passive: true },
  );
  resize();
  reconcile();
})();
