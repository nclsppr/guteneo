# ADR 0001: reliable modular monolith

Date 2026-09-16. Accepted for implementation.

Use one TypeScript package with domain/contracts/providers modules and Workers execution points. D1 SQL constraints/triggers couple acceptance, reservation and outbox. This makes the important crash boundary atomic and testable under official local D1 emulation. Tradeoff: SQLite-specific triggers must be translated on a future PostgreSQL migration. No exactly-once transport claim: supplier uncertainty is durable and never automatically replayed.

Private R2 addresses are organization/hash scoped. Dedupe and metadata lookup remain tenant-local. PDF import parses but never rewrites originals. HTML rendering sanitizes before approval. Missing scan holds production files in quarantine. Local simulation is loopback-only and uses a separate ledger.

Identity: Auth0 hosted identity/OAuth, JWT validation with jose; no bespoke OAuth cryptography. MCP uses createMcpHandler and SDK v2. Browser session owns human approvals, MCP consumes existing approvals. Account and real-client proof remain pending.

Postal: Pingen selected on official API and FR/LU/DE availability; authenticated PDF draft must be durably persisted and verified before paid send. Supplier price/currency and extracted address must match the approved operation. External credentials/contracts are prerequisites, never invented.
