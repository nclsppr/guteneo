import { describe, expect, it } from "vitest";
import {
  getMessageCatalogs,
  messageContexts,
} from "../../apps/web/src/message-catalogs-source";
import { translateMessage } from "../../apps/web/src/message-catalog";
import { setLocale } from "../../apps/web/src/locale";
import { msg, msgIn } from "../../apps/web/src/messages";

describe("generated active-language catalogs", () => {
  for (const locale of ["fr", "en", "de", "lb"] as const) {
    it(`preserves all legacy/English aliases, context and interpolation in ${locale}`, () => {
      const source = getMessageCatalogs(true);
      setLocale(locale, false);
      const keys = new Set([
        ...Object.keys(source.english),
        ...Object.keys(source.messages),
      ]);
      for (const key of keys)
        expect(msg(key, "synthetic", 42), key).toBe(
          translateMessage(key, locale, source.english, source.messages, [
            "synthetic",
            42,
          ]),
        );
      for (const key of Object.keys(messageContexts)) {
        const [context, label] = key.split("\u0004");
        expect(msgIn(context, label, "synthetic", 42), key).toBe(
          translateMessage(
            label,
            locale,
            source.english,
            source.messages,
            ["synthetic", 42],
            context,
            messageContexts,
          ),
        );
      }
      expect(msg(" Unrecognized user document title ")).toBe(
        " Unrecognized user document title ",
      );
      setLocale("fr", false);
    });
  }
});
