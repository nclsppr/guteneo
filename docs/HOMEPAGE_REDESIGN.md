# Homepage correspondence journey — local candidate, 20 September 2026

This records the initial homepage candidate and its verification. The subsequent
[assistant hub iteration](ASSISTANT_HUB.md) replaces the inline installation
panel with the choice of assistant-guided or direct sending, and shared public
and dashboard guides. The original visual proof below remains historical.

The homepage implements the approved target design: an explicit assistant-to-send
hero, one guided fictional example, one assistant selector and installation
panel, existing customer prices, four essential questions, a compact journal,
and the original Luxembourg footer. It is a local frontend candidate, not a
production release or qualification of assistant/provider availability.

## Behavior and boundaries

- Hero, example and footer calls to action focus the installation section.
  Shared footers on other public pages return to the homepage section; initial
  fragment focus is restored after React mounts, including on WebKit.
- The three example steps and channels use component-local state only. Prices,
  recipients and outcomes are labelled fictional; simulation never makes an API
  call, records consent, reserves credit or sends a document.
- Assistant stamps select one guide. Configuration instructions open explicitly;
  copying the first message never claims to install or connect anything.
- Customer tariff amounts and their dated qualifications are unchanged. The
  operational account, billing, approval and provider gates are unchanged.
- Mobile navigation exposes the principle, installation, pricing and account.
  Escape returns focus to the menu button. The footer retains reduced-motion
  support, its wording, its founding stamp, panorama and birds.

## Artwork

The original press and footer images are unchanged. The new press background was
extracted with the built-in image generation tool. Responsive transparent WebP
exports are 1200 and 640 pixels wide; the RGBA master, exact prompt, pixel-alpha
proof and ivory/white/dark composites are retained under
`assets/brand/source/press-halftone-transparent*`.

## Local verification

- TypeScript, ESLint, diff whitespace and the Impeccable detector passed.
- Both preview and production bundles built successfully. Existing large-bundle
  warnings remain; this change does not claim a performance benchmark.
- Full application and security suite: 1,087 Vitest tests and 132 Node security
  tests passed, with no failures. Vitest report:
  `reports/homepage-redesign-vitest.json`.
- Preview browser suite: 38 passed, four intentional desktop exclusions, zero
  failures. Includes desktop Chromium, iPhone WebKit, keyboard tabs, example
  isolation, clipboard/configuration journeys, menu, shared-footer navigation
  and reduced motion. Report: `reports/homepage-redesign-playwright.json`.
- Visual inspection at 1280 × 720, 390 × 844 and 320 × 740; no document-width
  overflow at 320 pixels. Final captures are in
  `reports/screenshots/homepage-redesign/`. Historical captures were preserved.

No real communication, payment, production activation, merge or deployment was
performed. The saved visual proof concerns the isolated preview model; production
publication and end-to-end provider qualification remain separate work.
