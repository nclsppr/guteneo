# Homepage: installation, welcome credit and Luxembourg

Local candidate prepared on 17 September 2026 in the isolated `feat/guteneo-homepage-luxembourg` worktree, starting from `b01e876`. This document records frontend work and local evidence; it does not attest a deployment or a live communication.

## Scope and current availability

The homepage retains Guteneo’s existing blue, ivory, Garamond and Plex identity. It adds assistant-specific installation steps, public guide/configuration downloads, a first-message copy action, a one-time €50 welcome-credit explanation, the qualified-provider-cost ×2 pricing principle for all three channels, a disabled Stripe top-up control, seven FAQ answers and a Luxembourg colophon.

The public site is still a browser-only demonstration. Account registration, live assistant authentication and real dispatch remain closed. Installation instructions describe preparation for activation; the displayed `https://guteneo.com/mcp` address is not evidence that an external host can connect today. Neither copying the first message nor downloading the Cursor configuration installs or authorizes a connector. The €50 offer is explicitly announced for service opening. No commercial unit rate or provider activation is claimed. The related ledger and provider work are separate changes.

The guide links directly to the official ChatGPT, Claude and Cursor instructions. The ChatGPT and Claude pages were checked during this work on 17 September 2026. The precise host account, organization settings and permissions remain subject to qualification on real accounts.

## Original image generation

Both new illustrations were produced with the actual built-in OpenAI `image_gen` tool in two separate generation calls. They were not downloaded from a stock or photography source. The panorama is an artistic impression of Luxembourg City, not a documentary map or architectural survey. No claim of exact geographic reproduction is made.

The original PNG files are preserved unchanged in `assets/brand/source/`. Each original and its public WebP derivative has a JSON sidecar containing the complete generation prompt, generation date, file paths, conversion command, sizes and SHA-256 hashes. The private source sidecars additionally retain the tool-output paths. These prompts are readable by the Impeccable provenance scanner without rewriting the original PNG bytes.

| Asset | Preserved original | Public derivative | WebP size |
| --- | --- | --- | --- |
| Luxembourg panorama | `assets/brand/source/luxembourg-panorama.png`, 2172 × 724 RGB | `apps/web/public/luxembourg-panorama.webp`, 2172 × 724 | 485,334 bytes |
| Swallow | `assets/brand/source/luxembourg-swallow.png`, 1536 × 1024 RGBA | `apps/web/public/luxembourg-swallow.webp`, 300 × 200 | 8,560 bytes |

Original panorama SHA-256: `fde097babb79ec3c875dd92b6262b78bd777f29fb02a166629e04428a0854760`.

Original swallow SHA-256: `8b5b4e0f0accdf06539f08c85f99f4f1fa5df871cc72b70b44a9197d2ac35f88`.

WebP conversion used `cwebp -q 88`; the bird also uses `-resize 300 0`. The WebP bird’s actual alpha channel was inspected: 50,949 fully transparent pixels, 9,051 partially transparent pixels, zero fully opaque pixels. Its fine gray ink and edges retain transparency. The footer was visually checked on the intended ivory background; no opaque rectangle is present. Guteneo has no dark-theme variant in this slice.

The wide panorama blends with the existing paper background and is cropped responsively on mobile. The three decorative birds share the small transparent WebP. Their flight and wing transforms animate by default. An accurately labeled pause/resume button controls both animation levels. `prefers-reduced-motion: reduce` stops both and hides the now-unneeded control. The birds are excluded from the accessibility tree; the panorama has a descriptive French alternative. The colophon reads “Fait au Luxembourg — Créé par Nicolas Pieper” and links to `https://nicolaspieper.com`.

## Local validation

- TypeScript typecheck and scoped ESLint passed.
- The public preview build passed.
- Ten preview browser cases passed across desktop Chromium and iPhone WebKit, including the existing six preview cases and four new homepage cases.
- New coverage checks guide and configuration downloads, host instruction switching, clipboard behavior, explicit future opening of the €50 credit, disabled top-up, three channel pricing rows, FAQ behavior, author link, loaded illustration dimensions, actual changing bird transforms, pause/resume, reduced motion, keyboard skip-link access, in-page anchor focus, horizontal overflow and absence of backend requests or page errors.
- Impeccable’s scoped detector returned no findings for the changed UI source.
- Desktop and iPhone footer screenshots received an independent review from the parent agent; the illustration, attribution, links and readability passed that bounded review.

Screenshots in `reports/screenshots/homepage/` show the installation, pricing and footer sections on desktop and iPhone. They are local preview evidence, not external assistant installation or production proof. The new tests live separately in `tests/preview-e2e/homepage.spec.ts` to avoid collision with the concurrent credit UI changes to the existing preview tests.
