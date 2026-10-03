# Guteneo engineering rules

Independent SaaS; no VBS systems, accounts, secrets or production dependencies.
Never send a real communication, provision paid infrastructure, merge, or deploy production without explicit authorization.
Production fails closed on simulation, development authentication, missing scan or provider configuration.
Tenant comes from authenticated membership. All lookups, unique keys and relations are tenant scoped.
Approval binds immutable content/recipient/options/cost; an assistant cannot assert human consent.
Expert delegation is OFF by default. Only an authenticated browser administrator may grant a bounded, expiring mandate to one OAuth client; the server records delegated approval distinctly from human review. Assistants cannot enable or extend that mandate. Postal draft transfer requires its distinct delegated authority; host confirmations, scopes and provider gates remain mandatory.
Acceptance, quota reservation and outbox insertion are atomic. Unknown provider outcomes never auto-retry.
Use integer minor currency units; never log content, recipients, tokens or signed URLs.
Keep real, sandbox and deterministic simulation evidence separate.

Every public video and its poster must match the user's resolved interface language (French, English, German or Luxembourgish), including the personal account preference. A language change stops the previous movie. Keep every supported language in the shared public-video catalog and regenerate its media before release; never present a French movie as a localized version. Promotional and role films end with the same official V5 halftone stamp, postmark and lowercase guteneo.com card. Preserve the validated montage and use the checked-in Remotion sources and locked dependencies for regeneration.
Narration uses complete natural sentences, native ElevenLabs Enhance and method C (three contextual blocks). Prefer Manon; when unavailable or unsuitable for a language, select and record a female voice for that language. Retain the second generated variation and its real provenance. Adapt scene timings to the original speech without acceleration or removing words. Keep music at a constant gain throughout speech, pauses and the logo, preserving only the score's ending fade. Reuse immutable voice snapshots for offline renders and display each film's actual duration from the shared catalog.

Commands: npm ci; npm run db:migrate; npm run db:seed; npm run demo; npm run typecheck; npm run lint; npm test; npm run test:e2e; npm run build.
Public design preview: npm run build:preview; npm run test:preview; npm run deploy:preview. Read docs/PUBLIC_PREVIEW.md before releasing. It is a separate browser-only fixture model, with no business bindings; never expose local development authentication on it.
Read docs/EXECUTION_PLAN.md, docs/PRODUCT.md and docs/ARCHITECTURE.md before changing invariants. Update proof and known gaps honestly. Coordinate file ownership between agents.
