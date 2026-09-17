# Remote D1 migration proof

Verified 2026-09-16 at 20:52–20:56 UTC on `guteneo-production`. The initial 11 migrations through `0011_account.sql` were applied in that window; subsequent migrations 0012 and 0013 are recorded below. The database was empty of application data before migration; no fixture users, organizations, documents or dispatches were seeded remotely.

## Failure and exact workaround

Wrangler 4.132.0 remote migration execution and the direct Cloudflare D1 `/query` API both rejected a trigger containing `SELECT CASE WHEN ... THEN RAISE(ABORT,...) END; END;` with `7500: incomplete input: SQLITE_ERROR`. The same temporary trigger with multiple plain SELECT statements, including multiline formatting, succeeded. Adding a trailing semicolon did not solve the CASE form.

A guard expressed as `SELECT RAISE(ABORT,'reason') WHERE predicate;` succeeded remotely. It has the same trigger behavior: both forms raise only when the predicate is true; false and NULL do not raise. This changes no approval, sender, quota, document-readiness, suppression or outbox condition.

`scripts/migrate-remote.mjs` transforms only that exact guard-only CASE pattern for transport. It rejects nested/otherwise unsupported CASE expressions for review. Nine guards are normalized across migrations 0001, 0004 and 0008. **The source migration files are unchanged.** Existing applied migrations were not edited.

## Atomicity and verification

A temporary remote batch created a checked table, then attempted a row that violated its CHECK constraint. The API rejected the batch and the table was absent afterward. This directly verified rollback of schema and data writes in a failed batch.

Each real migration was submitted as a single D1 API `{ batch: [{ sql }, ...] }` request. Its `INSERT INTO d1_migrations(name)` was the final statement in the same batch. Execution stopped on any failure; every migration returned success for every statement. No manual BEGIN/COMMIT or per-statement remote commits were used.

The local verifier applies source migrations and transformed migrations to separate Miniflare databases, compares normalized schema definitions, checks true/false/NULL/negative-value guard behavior, and runs integrity checks. It passed for all 11 migrations. A later remote comparison also matched **all 73 application-owned table/index/trigger definitions** exactly after whitespace normalization against that local expected schema. The Cloudflare-managed migration tracking table and internal metadata tables are excluded from this comparison.

Remote checks after application:

- All 11 expected filenames are present in `d1_migrations`, applied between 20:52:24 and 20:52:46 UTC.
- `PRAGMA foreign_keys` returned 1.
- `PRAGMA foreign_key_check` returned no violations.
- `PRAGMA quick_check` returned `ok`.
- Schema inventory: 37 tables (including migration tracking), 22 explicit indexes, 15 triggers; 74 objects after excluding SQLite/Cloudflare internals.
- Organizations, users, documents and dispatches each had count 0.
- All temporary `_guteneo_*` probe objects were removed.

The Miniflare internal `_cf_METADATA` table is excluded from local schema counts; it is not an application table and is absent remotely.

## Recovery markers

Pre-migration Time Travel bookmark (includes only migration tracking and temporary diagnostic probes):

`00000002-00000000-000050e8-2eb762d4a4ea53da72405a07be798443`

Post-migration bookmark:

`00000002-0000001c-000050e8-5efab382e5dda1f37d75518795c8f910`

These are recovery references, not a request to restore. Restoration after onboarding or live activity would lose later writes and requires a separately reviewed recovery decision.

## Reproduce the transport proof

Run `node scripts/migrate-remote.mjs --verify` for the local equivalence and integrity check. `--verify --schema` additionally prints the local normalized schema. Run `node scripts/migrate-remote.mjs` to list migration hashes/counts; `--json` emits the schema-only API batch plan. The helper does not read credentials or apply remote writes itself.

For a future authorized remote migration, first read the current migration ledger, retain a Time Travel bookmark, and select only unapplied entries from the reviewed plan. Submit each entry's entire `batch` to `POST /accounts/{account_id}/d1/database/{database_id}/query` through an authenticated Cloudflare connector/API client. Do not split a migration into separate requests. Confirm the ledger, schema, foreign keys and integrity afterward. Never replay the initial plan against an already migrated database.

## Applied source and transport hashes

The transport hash covers all semicolon-terminated statements joined with a newline, including the migration-ledger insertion. It therefore identifies exactly the applied batch representation.

| Migration                  | Statements | Guard rewrites | Source SHA-256                                                     | Transport SHA-256                                                  |
| -------------------------- | ---------: | -------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 0001_core.sql              |         34 |              3 | `2639699a3e0f1f55f531b58e45db602ff758b9c70510df38e4dd39e0a7d4d37a` | `536d51c40d05dad8146c6dbe8d6bc4922083410b6d46bb37cdc89d0dcfd13d83` |
| 0002_auth.sql              |         10 |              0 | `9f49d5c037cdcfb37805eae05e82af5511cc3fb48574fcc996bf5fc639fefd17` | `28ffc25d9602a1469eef92d026ab165f3ae4fe161d315cf923b535184d0f833a` |
| 0003_operations.sql        |          6 |              0 | `c9e957f562a898e38cea7e67c195222d072acbf1ece516b579f6aaa313dff3ac` | `8beafe1f9f642b5079beeffc1b5c71dc3e039399cae04d779eeb9decba5aad7c` |
| 0004_core_hardening.sql    |          6 |              3 | `2adad5fc48a79c72f017a38de41c50154217504240ab05e01d6cd7e7fe5aec76` | `f122d6ff751884a6ae42bbaa33926e80844732d19e5a246019a7689bda2d28bd` |
| 0005_content_limits.sql    |          5 |              0 | `5cf3b0123118c8ed7ea2235b1d3da1a5bdf18512ad5f1b90dace81a805e9068e` | `d9f0974c394ba79124f631687741f1723b5cd6d1d7b6635bc2db5a8b5d8abd15` |
| 0006_maintenance.sql       |          2 |              0 | `ba8f1a4206613a774eec8d8a0eaa9ef265f43a12b40b8cc669393dbe17faacaf` | `fa5f03c43fadc3360b2338750e8f9c7f42c99a1eeb4251c1845b9f74e4cce24f` |
| 0007_live_drafts.sql       |         10 |              0 | `963575c74d23bcd9e30aeaca65103c55b345d7cab1d4cc438fb057252ea31182` | `11d4c6e39b5088662527923bd3459ef016024cd9a6bbf1bba81b5eabb00a7354` |
| 0008_document_versions.sql |         17 |              3 | `097ecca3dde8d4d88ffd9d5bd08742ee8657d0bdafd37f6165b2cc0f49655844` | `8327b6dd1ef3bf1c0eb6b22e9f4eb36bdcfad047ac59e2100cf3e9791ea81337` |
| 0009_billing.sql           |          8 |              0 | `522c4fe012028056cc727020ca1848e6d38420fc37bd67df54c78e3aaf3783e6` | `818acb98355e5d23a3f81b850cbab06b20693b72f38efd232f912b284cc637dc` |
| 0010_onboarding_limits.sql |          3 |              0 | `47bf848dd51b61f28ce9f5d7e8555268f36eb48925bacc6b5662c022cc9730dc` | `d667951b9f23f5863c9d75aca569a1e9afd6e425614fa33ba5ce5a389191dc8d` |
| 0011_account.sql           |          7 |              0 | `82350f896e3f2a55cca32f979dd441c762f94866dd4a208eb61b76322edbee2d` | `1f6bde3d5d18dd737b0433873124dbc5ee50366af443fdbf49bac875333e0e1f` |

The CLI parser also preserves the existing trailing semicolon on a single-statement file; appending another semicolon creates an empty statement. This was caught in local verification before any real migration was submitted.

Cloudflare API endpoint schema was inspected through the installed connector before execution. Official references: [D1 batch operations](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/). The CASE parsing failure and successful workaround above are direct observations of the hosted API, not a claimed documented limitation.

## Subsequent rescan migration

`0012_document_rescan.sql` was applied with Wrangler at 21:07:42 UTC. A fresh read at 21:30 UTC confirmed all twelve ledger entries, no foreign-key violations, `quick_check=ok`, and zero organizations/users/documents/dispatches. No fictional data was seeded. Before the next quote migration the Time Travel bookmark was `00000006-00000000-000050e8-8ce7db8df18ba4b76cd35120d615668a`.

The local source/transport verifier subsequently passed all thirteen candidate migrations with 88 schema objects, nine unchanged guard normalizations, matching true/false/NULL semantics and no integrity violation. This candidate proof does not itself apply migration 0013 remotely.

## Applied trusted-quote migration

`0013_trusted_fax_quotes.sql` was applied through Wrangler at **2026-09-16 21:38:12 UTC**, executing 14 schema commands. The ledger now contains **13 migrations**. Fresh remote checks returned `foreign_keys=1`, an empty `foreign_key_check`, `quick_check=ok`, and zero tariff, quote, user and document rows. No tariff or funded budget was inserted. Post-migration Time Travel bookmark: `00000007-00000004-000050e8-0da2a14d1506ea2449dae78e21d0e675`.

## Welcome balance and exact supplier pricing — 2026-09-17

Migrations `0014_welcome_credit.sql` and `0015_exact_supplier_fax_pricing.sql` were applied in order at **2026-09-16 22:47:13 UTC**. Pre-migration bookmark: `00000010-00000000-000050e8-f27c1081e6e508635c5a61e7738de47c`. Post-migration bookmark: `00000010-00000006-000050e8-40deba372379015d4d341a488d194e85`.

Fresh checks confirmed fifteen ledger entries, `quick_check=ok`, zero foreign-key violations and zero organizations, grants, qualified supplier costs or v2 quotes. The local source/normalized transport schemas match across 121 objects. A fresh remote schema comparison matched all 120 domain objects exactly after the documented whitespace/guard normalization. The remaining `d1_migrations` tracking table differs only in quoting and whitespace added by Wrangler, with the same columns and constraints. No sample accounts, grants or tariffs were inserted remotely.

## Email/postal quotes, SES limits and verified accounts — 2026-09-17

Migrations `0016_live_delivery_quotes.sql`, `0017_ses_send_limits.sql`, `0018_email_recipient_attestation.sql` and `0019_verified_account_sessions.sql` were applied in order at **00:56:39–00:56:40 UTC** through four complete D1 API batches, each including its migration-ledger insertion. All statements succeeded (25, 8, 4 and 2 statements respectively). No application data, tariff, quota funding or live-send permission was inserted.

Pre-migration bookmark: `00000020-00000000-000050e9-6ccf89b8ade84d7c2b7b32b273330ca6`. Post-migration bookmark: `00000020-0000000b-000050e9-2475811ccdcf41f161a5abdcb8626ec5`.

Fresh remote checks confirmed nineteen ledger entries, `foreign_keys=1`, `quick_check=ok`, zero foreign-key violations and 146 schema objects including the migration ledger.

A fresh schema comparison matched all **145 application-owned objects** against the normalized source migrations applied to a separate in-memory SQLite database: SHA-256 `710c8ab2a96eb22f2fedf7fe44df1983a061b58620ddc6db79a40193c8c4e401` for both sorted, whitespace-normalized schema inventories. The ledger is excluded as in the previous comparison. Separate local workerd tests already exercised the source/transport behavior; a redundant workerd verifier invocation remained idle and was stopped after this independent schema comparison completed. Its stopped invocation is not recorded as a passing test.

| Migration | Source SHA-256 | Transport SHA-256 |
| --- | --- | --- |
| 0016 | `ff6cb71c2ee7bbb869d6b37c84481ff3308a075e13cccc68af55cc71e9cbaa14` | `a691b38c6bccdc63b4d94e1c50a0fb036ce943a995e002f7cf722b1f41c971da` |
| 0017 | `224d49155f9d656e539e21034034871f8d920bc0533933af328702de68400208` | `3bac6df3ac59f299350421e7fd32b8d287c1772a8753b5fc004d787e27e25ba8` |
| 0018 | `0e02d2d3e334b2fe0368d189c9fe72a293d58b0d55f9b5671cbfe3c8138c3f2b` | `1552b5dc9d694a4e555c77204c3921234a1fa002f08bc17c4e1262b35f08ae2f` |
| 0019 | `ee02af225e4ddc92867e5faa5eaffb7921a12082565dea6b51fdf77a816669f6` | `0c46560efdf16be0e007d7e7f03bf8ceb4c30ac171af95f2f875dab00db60834` |

## Postal review and public SES pricing — 2026-09-17

Committed source `813dd7173389f8fbcc1e1e1abaf68be905e7084c` supplied migrations0020–0022. They were applied at **02:17:17–02:17:35 UTC** as three complete D1 API batches, with each ledger insertion in its own migration transaction. All 15, 4 and 7 statements succeeded. No user, dispatch, postal review or tariff was inserted.

Pre-migration bookmark: `0000002a-00000000-000050e9-7f4054a4f992ba4b46625c4af4507e8c`. Post-migration bookmark: `0000002a-00000008-000050e9-e00340b59278c431d5780d363ba3d79c`.

Fresh remote checks confirmed all **22 migrations**, `foreign_keys=1`, no foreign-key violations and `quick_check=ok`. All **161 domain schema objects** match the locally verified source/transport schema after the established guard/whitespace normalization and excluding the ledger. The sorted inventory SHA-256 is `3806f500df5f390b3ef5f84ac2ba45f86570da9e0e29d13ecce16f0e41fcd75b`. The remote schema was read in bounded batches after an oversized observation was truncated; no migration was retried or replayed. The canonical health endpoint remained HTTP200, production mode, live sending disabled.

| Migration | Source SHA-256 | Transport SHA-256 |
| --- | --- | --- |
| 0020 | `5867ea67e48812e8772db893ce3b6c8198662767140797c58b22d986cbc7ccb7` | `b6cc5c07c40cf66c6a48daaccb4a90ef795d0773b848f4f85a7999c0731736ff` |
| 0021 | `80f73b855fa5353c9992afa3113baeff02019f6f9fb0caa1fa30158b5a54651a` | `6db398a3a161d3ed04d44cd10d76dd59cbfcbd6701f10bb6a14cfd6ffe53f618` |
| 0022 | `4562d478eec03c25cfa2f7ee4b39261c2f4a8cd51ed5063d8f2251c0b4b70c11` | `f46d82af13cf0dac0d5c40b4ebf2c94107684e129af9fdf2f30db1ebd5675d0d` |
