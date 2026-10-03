# Guteneo engineering rules

Every feature addition, change or removal MUST update the developer-only feature tree in `docs/feature-map.json`, the affected role/permission matrix and every affected customer journey in the same PR. Cover entry conditions, actor and current authority, steps, result, errors/recovery, web/native/REST/MCP surfaces, privacy, activation gates, technical contract, source and relevant test evidence. Keep implementation, activation and deployed proof distinct. Regenerate `docs/FEATURE_MAP.md` and `docs/FEATURE_MAP.html` with `node docs/build-feature-map.mjs` and verify `node docs/build-feature-map.mjs --check` (required by CI); keep these documents readable, visually polished and consistent. These files are repository technical documentation only: never import, copy, publish or link them in the official website, its navigation, assets, sitemap or public page generator. Four human membership roles are defined by `packages/contracts/src/roles.ts`; assistants are separate actors, never an invented fifth membership role.

Cloudflare cost optimisation is a standing engineering requirement. Measure CPU,
memory, startup, active time, idle time and billed requests; choose the smallest
configuration that passes representative functional, security and latency checks.
Keep instance counts bounded and avoid unnecessary wakeups, polling and repeated
work. Record current official prices, shared-account allowances and cost per
operation with clear assumptions; never claim free operation or a fixed total
bill from a quota or instance limit. Rewriting a component is permitted when
measured savings justify it and equivalent behaviour is verified. Requalify
resource and sleep changes before production; preserve document privacy, exact
bytes, authorization and process/response limits while reducing cost.

Independent SaaS; no VBS systems, accounts, secrets or production dependencies.
Never send a real communication, provision paid infrastructure, merge, or deploy production without explicit authorization.
Production fails closed on simulation, development authentication, missing scan or provider configuration.
Tenant comes from authenticated membership. All lookups, unique keys and relations are tenant scoped.
Approval binds immutable content/recipient/options/cost; an assistant cannot assert human consent.
Expert delegation is OFF by default. Only an authenticated browser administrator may grant a bounded, expiring mandate to one OAuth client; the server records delegated approval distinctly from human review. Assistants cannot enable or extend that mandate. Postal draft transfer requires its distinct delegated authority; host confirmations, scopes and provider gates remain mandatory.
Acceptance, quota reservation and outbox insertion are atomic. Unknown provider outcomes never auto-retry.
Use integer minor currency units; never log content, recipients, tokens or signed URLs.
Keep real, sandbox and deterministic simulation evidence separate.

Brand lettering is always lowercase and ink black: `guteneo` and a branded `guteneo.com` use the site's `--ink` color (`#181b22`), never cobalt. Blue belongs to the approved portrait, illustrations and decoration. Apply this rule to every new or revised web, email, social, video and other brand template. A standalone promotional card uses one wordmark or domain signature, never both `guteneo` and `guteneo.com`; text already present in an approved stamp counts as that signature. On a dark background, place the black lettering on a light paper panel instead of inventing a white or blue wordmark. Preserve the official source images. Read docs/BRAND_IDENTITY.md for asset roles and composition rules.

Reuse the approved blue swallows from `apps/web/public/luxembourg-blue-swallow-sheet.webp` as a subtle brand motif where composition space permits. Keep them few, decorative and naturally varied in scale; preserve their existing blue, with no generic bird replacements or extra logos.

Every public video and its poster must match the user's resolved interface language (French, English, German or Luxembourgish), including the personal account preference. A language change stops the previous movie. Keep every supported language in the shared public-video catalog and regenerate its media before release; never present a French movie as a localized version. Promotional and role films end with the same official V5 halftone stamp, postmark and lowercase guteneo.com card. Preserve the validated montage and use the checked-in Remotion sources and locked dependencies for regeneration.
Narration uses complete natural sentences, native ElevenLabs Enhance and method C (three contextual blocks). Prefer Manon; when unavailable or unsuitable for a language, select and record a female voice for that language. Retain the second generated variation and its real provenance. Adapt scene timings to the original speech without acceleration or removing words. Keep music at a constant gain throughout speech, pauses and the logo, preserving only the score's ending fade. Reuse immutable voice snapshots for offline renders and display each film's actual duration from the shared catalog.

Commands: npm ci; npm run db:migrate; npm run db:seed; npm run demo; npm run typecheck; npm run lint; npm test; npm run test:e2e; npm run build.
Public design preview: npm run build:preview; npm run test:preview; npm run deploy:preview. Read docs/PUBLIC_PREVIEW.md before releasing. It is a separate browser-only fixture model, with no business bindings; never expose local development authentication on it.
Read docs/EXECUTION_PLAN.md, docs/PRODUCT.md and docs/ARCHITECTURE.md before changing invariants. Update proof and known gaps honestly. Coordinate file ownership between agents.
