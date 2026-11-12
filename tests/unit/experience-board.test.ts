import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  boardText,
  DRUM,
  fitCells,
  flipPath,
} from "../../apps/experience/src/components/flap-engine";
import {
  boardStatus,
  boardTone,
  presentedStatus,
  statusLabel,
} from "../../apps/experience/src/board-status";
import { DISPATCH_GROUPS } from "../../packages/contracts/src/dispatch-groups";
import type { Dispatch } from "../../apps/experience/src/api/types";

const locales = ["fr", "en", "de", "lb"] as const;
const directory = new URL(
  "../../apps/experience/src/locales/",
  import.meta.url,
);
const messages: Record<string, Record<string, string>> = {};
for (const file of readdirSync(directory).filter((name) =>
  name.endsWith(".json"),
))
  Object.assign(
    messages,
    JSON.parse(readFileSync(new URL(file, directory), "utf8")),
  );
const translate = (locale: (typeof locales)[number]) => (key: string) =>
  messages[key]?.[locale] ?? key;

describe("split-flap sequencing", () => {
  it("spells text as a board does and always fills its cells", () => {
    expect(boardText("  Étude  Weber, straße ")).toBe("ÉTUDE WEBER, STRASSE");
    expect(fitCells("gare", 6)).toEqual(["G", "A", "R", "E", " ", " "]);
    expect(fitCells("0,60 €", 8, "end").join("")).toBe("  0,60 €");
    const cut = fitCells("jean.muller@example.test", 10);
    expect(cut).toHaveLength(10);
    expect(cut.at(-1)).toBe("…");
  });

  it("flips forward through the drum and lands on the target", () => {
    expect(flipPath("A", "A")).toEqual([]);
    expect(flipPath("A", "D", 5)).toEqual(["B", "C", "D"]);
    // A long way round is shortened to its last flips.
    const long = flipPath(" ", "Z", 3);
    expect(long).toHaveLength(3);
    expect(long.at(-1)).toBe("Z");
    // A glyph outside the drum is shown directly, never looped over.
    expect(flipPath("A", "…")).toEqual(["…"]);
    expect(new Set(DRUM).size).toBe(DRUM.length);
  });
});

describe("board status wording", () => {
  const statuses = [
    ...Object.values(DISPATCH_GROUPS).flat(),
    "approved",
    "sending",
    "scheduled",
  ];

  it("fits every status in the sixteen cells of the board, in four languages", () => {
    for (const locale of locales)
      for (const status of statuses)
        for (const channel of ["fax", "email", "postal"] as const) {
          const label = boardText(
            boardStatus(status, translate(locale), channel),
          );
          expect(
            [...label].length,
            `${locale} ${status} ${channel}: ${label}`,
          ).toBeLessThanOrEqual(16);
          expect(label, `${locale} ${status}`).not.toContain("BOARD.STATUS");
          // Every glyph exists on the drum, so no cell skips its animation.
          for (const glyph of label)
            expect(DRUM, `${locale} ${status}: ${glyph}`).toContain(glyph);
        }
  });

  it("keeps the exact product status as the accessible text", () => {
    const t = translate("en");
    expect(statusLabel("delivered", t, "email")).toBe(
      "Accepted by recipient server",
    );
    expect(boardStatus("delivered", t, "email")).toBe("Server accepted");
    // No override: the board uses the exact label.
    expect(boardStatus("cancelled", t, "fax")).toBe(
      statusLabel("cancelled", t, "fax"),
    );
    expect(statusLabel("never_seen", t)).toBe("never seen");
  });

  it("colors by the shared status groups and reads a held dispatch as scheduled", () => {
    expect(boardTone("prepared")).toBe("signal");
    expect(boardTone("queued")).toBe("ink");
    expect(boardTone("delivered")).toBe("ok");
    expect(boardTone("cancelled")).toBe("dim");
    expect(boardTone("failed")).toBe("danger");
    const held = {
      status: "prepared",
      activeSchedule: { status: "approved" },
    } as Dispatch;
    expect(presentedStatus(held)).toBe("scheduled");
    expect(presentedStatus({ status: "queued" } as Dispatch)).toBe("queued");
  });
});

describe("station copy", () => {
  it("has all four languages for every key and matching placeholders", () => {
    for (const [key, values] of Object.entries(messages)) {
      expect(Object.keys(values).sort(), key).toEqual([...locales].sort());
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      for (const locale of locales)
        expect(placeholders(values[locale]), `${key} ${locale}`).toEqual(
          placeholders(values.fr),
        );
    }
  });
});
