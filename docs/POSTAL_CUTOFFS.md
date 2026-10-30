# Postal processing cut-off times

## Source and scope

Documentation checked on **21 September 2026**:

- [Pingen cut-off introduction](https://help.pingen.com/en/submit-and-send-letters/introduction-cut-off-times).
- [Matching French source](https://help.pingen.com/fr/soumettre-et-envoyer-les-lettres/introduction-aux-cut-off-temps).
- [Swiss shipping and bulk B Mail](https://help.pingen.com/en/submit-and-send-letters/shipping-options-switzerland).

Times depend on the **destination country**, not sender country or organization
postal profile. CE(S)T means CET in winter and CEST in summer, as in Paris.
`apps/web/src/postal-cutoff.ts` is shared by the FAQ and preparation guidance.

## Verified data

| Destination | Cut-off | Printing and postal handover before cut-off |
| --- | --- | --- |
| Belgium, Luxembourg | 01:00 | Same business day |
| India | 06:00 | Next business day |
| Other countries | 10:00 | Same business day |
| France, Switzerland, Germany, Netherlands | 12:00 | Same business day |
| Austria | 12:00; Friday 10:00 | Same business day |
| Spain | 12:00 | Within two business days |
| United Kingdom | 16:00 | Same business day |

No processing takes place on weekends or public holidays. Arrival after cut-off
moves a letter to the next processing cycle; the interface does not promise
handover tomorrow. Economy to Germany and bulk B Mail to Switzerland may take
longer. Swiss bulk B Mail may wait for sufficient volume under provider conditions.

## Presentation and limits

`/#postal-cutoff-faq` directly opens the native accordion. The table explains
timing without claiming activation of additional destinations or shipping modes;
preparation checks their actual availability.

Public copy discusses cut-off, processing and postal handover without naming or
linking the provider. This document keeps sources and verification date. Delivery
time follows handover; these times guarantee no receipt date.

An imported PDF or a quote is not a completed send. Cut-off applies to transmission
to the print service, rather than confirmation or local Guteneo acceptance;
asynchronous processing may cross it. No countdown or exact date is calculated
without a qualified holiday calendar. Acceptance, quotas, consent, billing and
provider-send rules are unchanged.

## Candidate validation

15 focused scenarios passed in desktop Chromium, mobile Chromium and simulated
iPhone WebKit: destination changes, economy exception, focused FAQ in a new tab
without losing form state, table overflow, postal checks and final confirmation.
Desktop/mobile captures were inspected; WebKit checks grouped-country wrapping.
TypeScript, ESLint and application build/dry-run passed. These are local fixtures,
with no real send or new MCP-host qualification. Publication requires separate
merged-commit CI and dated public-origin proof.
