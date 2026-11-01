import { PINGEN_DESTINATION_RESTRICTIONS_URL } from "../../packages/providers/pingen-destination-availability";
import type { Fetcher } from "../../packages/providers";

/** Deterministic reference fixture, never live eligibility evidence. */
export function destinationRestrictionsHtml(
  unavailable: string[] = [],
  delayed: string[] = [],
) {
  const table = (entries: string[]) => {
    const cells = entries.length ? entries : ["none"];
    const rows = Array.from(
      { length: Math.ceil(cells.length / 5) },
      (_, index) =>
        `<tr>${Array.from({ length: 5 }, (_, column) => `<td>${cells[index * 5 + column] ?? ""}</td>`).join("")}</tr>`,
    ).join("");
    return `<table><thead><tr>${["Europe", "America", "Asia", "Oceania", "Africa"].map((name) => `<th>${name}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  };
  return `<div class="rich-text w-richtext"><h2>Countries with restricted mail delivery</h2><p>It is currently not possible to send letters to the following countries via Pingen:</p>${table(unavailable)}<h2>Countries with delayed mail delivery</h2><p>Delivery delays are currently known to the following countries:</p>${table(delayed)}</div>`;
}

export const destinationRestrictionsResponse = (
  unavailable?: string[],
  delayed?: string[],
) =>
  new Response(destinationRestrictionsHtml(unavailable, delayed), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

/** Preserve existing provider fixtures/call order while supplying the new read. */
export const withDestinationRestrictions =
  (fetcher: Fetcher): Fetcher =>
  (url, init) =>
    String(url) === PINGEN_DESTINATION_RESTRICTIONS_URL
      ? Promise.resolve(destinationRestrictionsResponse())
      : fetcher(url, init);
