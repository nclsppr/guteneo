/**
 * A split-flap cell is a drum of characters: to show another one it flips
 * through the characters in between. This module holds the pure sequencing
 * and the small imperative animation; the React component only owns the row.
 */

/** Drum order. A character outside it flips directly to its target. */
export const DRUM =
  " ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ0123456789.,:;-/+@#&'()€%!?*_";

/** The text as a board shows it: capitals, one glyph per cell. */
export function boardText(value: string): string {
  return value.replace(/ß/g, "ss").replace(/\s+/g, " ").toUpperCase().trim();
}

/** Exactly `cells` glyphs: padded on one side, cut with an ellipsis. */
export function fitCells(
  value: string,
  cells: number,
  align: "start" | "end" = "start",
): string[] {
  const glyphs = [...boardText(value)];
  const cut =
    glyphs.length > cells
      ? [...glyphs.slice(0, Math.max(0, cells - 1)), "…"]
      : glyphs;
  const padding = Array<string>(Math.max(0, cells - cut.length)).fill(" ");
  return align === "end" ? [...padding, ...cut] : [...cut, ...padding];
}

/**
 * The glyphs a cell shows on its way from `from` to `to`, target included.
 * A long way round is shortened to its last flips so a board settles fast.
 */
export function flipPath(from: string, to: string, maxSteps = 5): string[] {
  if (from === to) return [];
  const start = DRUM.indexOf(from);
  const end = DRUM.indexOf(to);
  if (start < 0 || end < 0) return [to];
  const distance = (end - start + DRUM.length) % DRUM.length;
  const steps = Math.min(distance, Math.max(1, maxSteps));
  const path: string[] = [];
  for (let step = steps - 1; step >= 0; step -= 1)
    path.push(DRUM[(end - step + DRUM.length) % DRUM.length]);
  return path;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type FlipOptions = {
  delay?: number;
  stepMs?: number;
  maxSteps?: number;
  /** Called once per mechanical flip, for the optional sound. */
  onFlip?: () => void;
};

const running = new WeakMap<HTMLElement, { cancel: () => void }>();

function half(className: string, glyph: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  const inner = document.createElement("span");
  inner.textContent = glyph;
  element.appendChild(inner);
  return element;
}

/**
 * Animate one cell to `to`. The cell's resting markup is a single text node;
 * the four half-flaps exist only while it moves, so an idle board stays a
 * light document.
 */
export function flipCell(
  cell: HTMLElement,
  to: string,
  options: FlipOptions = {},
): void {
  running.get(cell)?.cancel();
  const from = cell.dataset.glyph ?? " ";
  const settle = (glyph: string) => {
    cell.dataset.glyph = glyph;
    cell.textContent = glyph === " " ? "" : glyph;
    cell.classList.remove("is-flipping");
  };
  if (from === to) {
    if (!cell.dataset.glyph) settle(to);
    return;
  }
  const path = flipPath(from, to, options.maxSteps);
  if (prefersReducedMotion() || typeof cell.animate !== "function") {
    settle(to);
    return;
  }
  const stepMs = options.stepMs ?? 64;
  let cancelled = false;
  let animations: Animation[] = [];
  const stop = () => {
    cancelled = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    for (const animation of animations) animation.cancel();
    running.delete(cell);
  };
  running.set(cell, {
    cancel: () => {
      stop();
      settle(to);
    },
  });
  let current = from;
  const step = (index: number) => {
    if (cancelled) return;
    if (index >= path.length) {
      clearTimeout(deadline);
      running.delete(cell);
      settle(to);
      return;
    }
    const next = path[index];
    // Underneath: the next glyph's top and the current glyph's bottom.
    // On top: the current top falls away, then the next bottom lands.
    const falling = half("flap-half is-top is-moving", current);
    const landing = half("flap-half is-bottom is-moving", next);
    cell.classList.add("is-flipping");
    cell.replaceChildren(
      half("flap-half is-top", next),
      half("flap-half is-bottom", current),
      falling,
      landing,
    );
    options.onFlip?.();
    const down = falling.animate(
      [{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }],
      { duration: stepMs / 2, easing: "ease-in", fill: "forwards" },
    );
    const up = landing.animate(
      [{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }],
      {
        duration: stepMs / 2,
        delay: stepMs / 2,
        easing: "ease-out",
        fill: "both",
      },
    );
    animations = [down, up];
    up.onfinish = () => {
      current = next;
      cell.dataset.glyph = next;
      step(index + 1);
    };
  };
  const timer = setTimeout(() => step(0), options.delay ?? 0);
  // A board must never stay on an intermediate glyph: if the animation clock
  // is paused (a background tab, a throttled frame) the cell still lands on
  // its real value shortly after it should have.
  const deadline = setTimeout(
    () => running.get(cell)?.cancel(),
    (options.delay ?? 0) + path.length * stepMs + 900,
  );
}

/** Stop any movement and show the final glyphs at once. */
export function settleCell(cell: HTMLElement): void {
  running.get(cell)?.cancel();
}
