import { describe, expect, it } from "vitest";
import {
  englishIndex,
  translateMessage,
} from "../../apps/web/src/message-catalog";
import shell from "../../apps/web/src/locales/messages-shell.json";
import operations from "../../apps/web/src/locales/messages-operations.json";
import distribution from "../../apps/web/src/locales/messages-studio-distribution-settings.json";
import delivery from "../../packages/contracts/src/delivery-messages.json" with { type: "json" };

describe("message catalog index", () => {
  it("keeps every English source when catalogs share a French key", () => {
    const sources = [distribution, shell, operations, delivery];
    const english = englishIndex(sources);
    const merged = Object.assign({}, ...sources);
    const fr = (source: string) =>
      translateMessage(source, "fr", english, merged, []);
    // Two catalogs translate "Courrier postal", "Expiration" and "Ouvrir le
    // document" from different English sources; both must stay French.
    expect(fr("Postal mail")).toBe("Courrier postal");
    expect(fr("Post")).toBe("Courrier postal");
    expect(fr("Expires")).toBe("Expiration");
    expect(fr("Expiry")).toBe("Expiration");
    expect(fr("Open document")).toBe("Ouvrir le document");
    expect(fr("Open the document")).toBe("Ouvrir le document");
  });

  it("lets the first catalog win for one English source", () => {
    const english = englishIndex([
      { Premier: ["Same", "Erst", "Éischt"] },
      { Second: ["Same", "Zweit", "Zweet"] },
    ]);
    expect(english.Same[0]).toBe("Premier");
  });
});
