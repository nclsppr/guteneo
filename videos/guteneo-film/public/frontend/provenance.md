# Guteneo frontend captures

Captured `2026-09-21T23:26:46.989Z` using Playwright Chromium, 1920 × 1080,
device scale 1, French, reduced motion.

## homepage.png

- Actual anonymous `https://guteneo.com/`, no account data.
- Public source `22c24d5235dd204e48effafabef417c9bafac213`, built `2026-09-21T23:24:46.701Z`.
- Capabilities announced fax/postal open, email closed; screenshot qualifies no send.

## atelier.png

- Local `http://127.0.0.1:5198/#/app`, same source; no local apps/web/package changes.
- Existing application uses `VITE_PUBLIC_PREVIEW=true` as documented by `docs/PUBLIC_PREVIEW.md`/`apps/web/src/api.ts`.
- Native `preview.ts` synthetic data; preview/simulation disclosures visible.
- No login/backend/customer document/send; fixture data proves no provider availability.

## Reproduction

From repository root:

```sh
node videos/guteneo-film/public/frontend/capture.mjs
```

Script starts/stops local Vite port 5198, uses fresh contexts, blocks non-GET/service
routes except native anonymous homepage capabilities/session reads, waits for fonts/
images and retains unretouched DOM/disclosures. Workspace makes no backend call.
Machine detail: `provenance.json`.

## approval.png

- Native postal-review view of same 1920 × 1080 fixture.
- Form prepared only browser-memory synthetic PDF with its original French fixture filename `Votre courrier · exemple.pdf`.
- Synthetic recipient: `Maison Papier · fictive`, `12 rue de l’Exemple`, `75002 Paris`, `FR`; retained exactly as the fixture displays.
- Stopped before approval/confirmation/dispatch, including simulation; no provider/backend call.
- Simulation banner, fixture price/recipient/PDF remained visible and unchanged.
