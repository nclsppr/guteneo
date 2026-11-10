import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../../apps/web/src/api";
import { ErrorNotice, Loading } from "../../apps/web/src/components";
import { setLocale, t } from "../../apps/web/src/locale";
import { msg } from "../../apps/web/src/messages";

afterEach(() => setLocale("fr", false));

describe("reviewed browser error copy", () => {
  for (const locale of ["fr", "en", "de", "lb"] as const) {
    it(`withholds an unreviewed server body and keeps support recovery in ${locale}`, () => {
      setLocale(locale, false);
      const response =
        "Synthetic response containing recipient@example.invalid and synthetic_token";
      const html = renderToStaticMarkup(
        createElement(ErrorNotice, {
          error: new ApiError("UNREVIEWED_SERVER_ERROR", response, 500),
          retry: () => undefined,
        }),
      );
      expect(html).toContain(t.errorTitle);
      expect(html).not.toContain(response);
      expect(html).not.toContain("recipient@example.invalid");
      expect(html).not.toContain("synthetic_token");
      expect(html).toContain('<details class="error-details">');
      expect(html).not.toContain("<details open");
      expect(html).toContain("UNREVIEWED_SERVER_ERROR");
      expect(html).toContain(t.retry);
    });

    it(`preserves reviewed server copy and prefers code-specific recovery in ${locale}`, () => {
      setLocale(locale, false);
      const reviewed = "The file exceeds 5 MB.";
      const html = renderToStaticMarkup(
        createElement(ErrorNotice, {
          error: new ApiError("LEGACY_REVIEWED_ERROR", reviewed, 400),
        }),
      );
      expect(html).toContain(msg(reviewed));
      const refused = renderToStaticMarkup(
        createElement(ErrorNotice, {
          error: new ApiError("FORBIDDEN", reviewed, 403),
        }),
      );
      expect(refused).toContain(
        msg("This action is not permitted for your account."),
      );
      expect(refused).not.toContain(msg(reviewed));
    });

    it(`retains interpolated local field validation in ${locale}`, () => {
      setLocale(locale, false);
      const validation = msg(
        "Header row {0} does not exist in sheet {1}.",
        12,
        "Synthetic sheet",
      );
      const html = renderToStaticMarkup(
        createElement(ErrorNotice, { error: new Error(validation) }),
      );
      expect(html).toContain(validation);
      expect(html).not.toContain("error-details");
    });
  }
});

describe("shared loading states", () => {
  for (const shape of ["page", "table", "form", "document"] as const)
    it(`keeps the ${shape} skeleton decorative with a localized loading status`, () => {
      setLocale("en", false);
      const html = renderToStaticMarkup(createElement(Loading, { shape }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Loading…"');
      expect(html).toContain('class="loading-skeleton" aria-hidden="true"');
      expect(html).toContain('<p class="loading-label">Loading…</p>');
      expect(html).not.toMatch(/<(?:button|input|a)\b/);
    });
});
