# Guteneo engineering rules

Independent SaaS; no VBS systems, accounts, secrets or production dependencies.
Never send a real communication, provision paid infrastructure, merge, or deploy production without explicit authorization.
Production fails closed on simulation, development authentication, missing scan or provider configuration.
Tenant comes from authenticated membership. All lookups, unique keys and relations are tenant scoped.
Approval binds immutable content/recipient/options/cost; an assistant cannot assert human consent.
Acceptance, quota reservation and outbox insertion are atomic. Unknown provider outcomes never auto-retry.
Use integer minor currency units; never log content, recipients, tokens or signed URLs.
Keep real, sandbox and deterministic simulation evidence separate.

Commands: npm ci; npm run db:migrate; npm run db:seed; npm run demo; npm run typecheck; npm run lint; npm test; npm run test:e2e; npm run build.
Public design preview: npm run build:preview; npm run test:preview; npm run deploy:preview. Read docs/PUBLIC_PREVIEW.md before releasing. It is a separate browser-only fixture model, with no business bindings; never expose local development authentication on it.
Read docs/EXECUTION_PLAN.md, docs/PRODUCT.md and docs/ARCHITECTURE.md before changing invariants. Update proof and known gaps honestly. Coordinate file ownership between agents.
