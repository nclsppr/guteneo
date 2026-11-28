# Cost model

Run `npm run costs`; machine-readable calculation is `reports/cost-model.json`. Calculations use integer USD micro-units and explicit divisors. Not customer prices and not a complete guaranteed budget.

Assumptions per month: 70% email, 10% fax, 20% postal; physical document two pages, 500 kB; one distinct document per two sends; half of those rendered for three browser seconds; 90-day content retention, twelve-month metadata estimate (12 kB/send); 20 HTTP calls/send, 10 ms CPU each; three events/send; three queue operations/send plus 5% one extra read; cron 43,200/month. D1 includes index write amplification estimate (100 written, 300 read rows/send). Browser sessions <=10 average daily peak. Values are hypotheses to replace with staging measurements.

Verified 2026-09-16: Workers Paid $5/month, 10M requests and 30M CPU ms included, then $0.30/M requests and $0.02/M CPU ms. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/). Queues includes 1M operations then $0.40/M; normal delivery uses write/read/delete; retries add reads. [Queues](https://developers.cloudflare.com/queues/platform/pricing/). D1 paid includes 25B reads, 50M writes and 5GB, excess $0.001/M reads, $1/M writes and $0.75/GB-month. [D1](https://developers.cloudflare.com/d1/platform/pricing/).

R2 Standard $0.015/GB-month, $4.50/M class A, $0.36/M class B, first 10GB/1M A/10M B included. [R2](https://developers.cloudflare.com/r2/pricing/). Browser Run 10 hours/month included then $0.09/hour; Puppeteer sessions also charge $2 per concurrent browser above ten, using average daily peaks. Model rounds browser hours per current billing policy. [Browser Run](https://developers.cloudflare.com/browser-run/pricing/). Account allowances are shared, not allocated anew to every service, organization or environment.

SES Essentials $0.16/1000 is used; applicable plan/region must be confirmed. Alternative pay-as-you-go $0.10/1000 and outgoing attachment data $0.12/GB are not silently mixed. SES simulator can be billed. [SES](https://aws.amazon.com/ses/pricing/). No attachments assumed in this subtotal. Fax and postal transport remain `number of pages/letters × account/destination quotation`, plus fax number and any minimum commitments; never zero.

Identity is independent of dispatch count. Planning hypotheses: 100/1,000/10,000 monthly active people for the three volumes, to be replaced with actual behavior. The user-selected beta stays on Auth0 Free with verified email and a signed verified-account claim, without mandatory MFA or a paid-plan upgrade. This decision does not promise free availability of every future MFA/export feature; any paid change requires a separate decision. The initial provider comparison is recorded in IDENTITY_MCP.md.

Scanner, alerting, support labor, review of uncertain transmissions, legal/provider contracts, backup operations, tax and FX are unquantified. Backup line is deliberately storage-only in a separate account with no free allowance and is not a complete backup bill. Above 5GB metadata or sustained p95 acceptance >2s, investigate growth and contention. The 100k scenario produces a rounded 15GB metadata estimate at twelve months: it **exceeds the current 10GB single-D1 limit**. Its arithmetic subtotal is a workload comparison, not a deployable single-database plan. Before that point, reduce justified retention/index amplification or execute the documented PostgreSQL migration; this delivery does not implement sharding or a second backend.

Discovery offering: administered simulation credits with channel counts and cost ceilings. New real organizations start with zero quota and disabled channels. Physical credits require an explicit funded allowance; no checkout or commercial tariff is published.


## Incremental tariff maintenance — 28 November 2026

Worldwide fax prices add one scheduled invocation at 02:17 UTC per day. Postal
price refresh shares the existing minute invocation and claims at most one due
scope. Both reuse the existing Worker and D1 database. The fax schedule reads
a source deck each day and reuses identical compiled buckets. A new revision
retains its dated evidence. Unreferenced old decks and revisions are eligible
for cleanup after seven days.

| Local operation | D1 statements | Rows read / written | Node process CPU |
| --- | ---: | ---: | ---: |
| Fax, install a new deck | 20 | 35 / 38 | 379 ms |
| Fax, reuse the same deck | 8 | 10 / 5 | 223 ms |
| Fax, refresh already leased or not due (measured not due) | 2 | 1 / 0 | 12 ms |
| Fax, source deck unavailable | 3 | 2 / 2 | 19 ms |
| Postal, scope not due | 1 | 3 / 0 | 4 ms |
| Postal, due price refresh | 2 | 9 / 4 | 9 ms |
| Postal, calculator unavailable | 2 | 7 / 4 | 14 ms |

The local Miniflare runs instrumented D1 result metadata on the existing
worldwide catalog and postal policy fixtures. The synthetic fax CSV was
4,300,680 bytes and produced 13 buckets containing 3,200,350 bytes of route
text. Each due fax run issued four intercepted source requests and used an
injected ownership snapshot. Live ownership pagination adds requests. The
postal fixture made three intercepted provider calls on a due tick and zero
on an idle tick. CPU is a single host-process sample including local transport
overhead. Production CPU billing, actual bucket distribution, D1 index size and
storage for retained revisions require live measurements.

For a 30-day illustration, one fax installation and 29 identical-deck renewals
at the fixture's sizes use 325 reads, 183 writes and 6,846 local CPU ms before
retention cleanup. At marginal rates after shared allowances, that is about
$0.00018 for D1 operations and $0.00014 using the local CPU figure as a proxy.
Keeping one such raw bucket payload for a month represents about $0.0024 of
storage before SQLite and index overhead. Four successful postal renewals and
43,196 idle lookups would read 129,624 rows and write 16, about $0.00015 in
incremental D1 operations. Postal volume depends on the number of distinct
sender, country, format and paper-count combinations. Supplier dispatch charges
are accounted separately.

Workers Standard currently includes 10M requests and 30M CPU ms per account
month, with overages of $0.30/M requests and $0.02/M CPU ms. Outbound Worker
subrequests have no separate request charge. D1 includes 25B reads, 50M writes
and 5 GB, with overages of $0.001/M reads, $1/M writes and $0.75/GB-month.
These allowances are shared across the account. Check the actual cron CPU,
D1 read/write metrics and database growth before converting these fixture
projections into a production budget. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
