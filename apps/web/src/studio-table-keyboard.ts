import type { KeyboardEvent } from "react";

/** iOS WebKit can focus an overflow region without scrolling it on arrow keys. */
export function scrollStudioTable(event: KeyboardEvent<HTMLDivElement>) {
  if (
    event.target !== event.currentTarget ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !["ArrowLeft", "ArrowRight"].includes(event.key)
  )
    return;
  const region = event.currentTarget;
  if (region.scrollWidth <= region.clientWidth) return;
  event.preventDefault();
  region.scrollBy({
    left: event.key === "ArrowRight" ? 40 : -40,
    behavior: "instant",
  });
}
