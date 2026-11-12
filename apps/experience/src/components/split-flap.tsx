import { memo, useLayoutEffect, useRef } from "react";
import { fitCells, flipCell, settleCell } from "./flap-engine";
import { flapSound } from "../sound";
import "./split-flap.css";

export type FlapTone = "ink" | "signal" | "ok" | "danger" | "dim";

type Props = {
  text: string;
  cells: number;
  align?: "start" | "end";
  tone?: FlapTone;
  size?: "sm" | "md" | "lg" | "xl";
  /** Milliseconds before this row starts moving, for a cascading board. */
  delay?: number;
  className?: string;
};

/**
 * One row of split-flap cells. It is decoration for sighted readers: the
 * caller always provides the same text to assistive technology (a table cell,
 * a heading or a label), so this element is hidden from it.
 */
export const SplitFlap = memo(function SplitFlap({
  text,
  cells,
  align = "start",
  tone = "ink",
  size = "md",
  delay = 0,
  className,
}: Props) {
  const row = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    // The row owns exactly `cells` children; React never renders inside it.
    while (element.childElementCount < cells) {
      const cell = document.createElement("span");
      cell.className = "flap";
      cell.dataset.glyph = " ";
      element.appendChild(cell);
    }
    while (element.childElementCount > cells)
      element.lastElementChild?.remove();
    const glyphs = fitCells(text, cells, align);
    const entering = first.current;
    first.current = false;
    Array.from(element.children).forEach((child, index) => {
      flipCell(child as HTMLElement, glyphs[index], {
        delay: delay + index * (entering ? 14 : 9),
        maxSteps: entering ? 3 : 5,
        onFlip: flapSound,
      });
    });
  }, [text, cells, align, delay]);

  useLayoutEffect(() => {
    const element = row.current;
    return () => {
      if (element)
        Array.from(element.children).forEach((child) =>
          settleCell(child as HTMLElement),
        );
    };
  }, []);

  return (
    <span
      ref={row}
      aria-hidden="true"
      className={`flaps is-${size} is-${tone}${className ? ` ${className}` : ""}`}
    />
  );
});
