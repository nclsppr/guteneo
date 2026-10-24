# Explanatory mechanisms

These three Anatomy **Figures** use invented workshop objects to explain real
software contracts. The objects are metaphors, not a drawing of deployed hardware.
The position of one synthetic document follows the same authored step model as
the caption and readout. No movement represents a real send or live telemetry.

## 1. The routing bench

A private control bench feeds a separate rack of external delivery machines.
The physical gap is the Cloudflare/provider boundary, not a residency promise.
The queue magazine meters work; it does not itself approve or send a document.

Parts planned before geometry: two decks, eight feet, two perimeter grooves,
eight deck screws, control chassis, lid seam, control window, window bezel,
three status lamps, three vent slots, D1 ledger case, three ledger drawers,
three handles, R2 archive case, archive lid, lid hinges, scan gate frame,
scan gate uprights, inspection bed, queue magazine, three queue cards,
magazine guides, feed stop, two rails, three rail supports, sample carriage,
sample document, Telnyx fax chassis, fax paper tray, fax cover, fax dial,
fax output sheet, Pingen printer chassis, printer feed tray, two rollers,
roller bearings, printer output tray, postal envelope, Resend terminal,
terminal bezel, terminal slot, envelope tray, four chassis fasteners.

## 2. The acceptance interlock

A review clamp captures a separate approval plate. A single acceptance crossbar
joins the quota and outbox drawers, explaining their atomic D1 commitment. The
unknown-outcome tray has a physical stop: it cannot feed itself back into sending.

Parts: deck, four feet, groove, four screws, two travel rails, three rail mounts,
four rail stops, prepared-document tray, tray edge, document stack, review frame,
two review posts, review crosshead, approval plate, seal housing, seal knob,
seal ring, two clamp shoes, acceptance cabinet, lid seam, quota drawer,
quota handle, outbox drawer, outbox handle, coupling crossbar, two coupling
bosses, queued-card magazine, magazine bed, three cards, two guides, provider
handoff stand, two bearings, handoff roller, output tray, two output stops,
unknown tray, two tray walls, stop semaphore, semaphore cap, reconciliation
card, four cabinet fasteners, sample carriage, sample envelope, envelope flap.

Approval remains a record attached to a `prepared` dispatch. There is no invented
`approved` dispatch state. Acceptance is not delivery. `submission_unknown`
requires reconciliation; it never automatically retries a provider submission.

## 3. The document workshop

A sealed original archive sits beside a mapping comb, a versioned template plate
and a generation press. The press emits a separate derived PDF; it cannot rewrite
the original archive or jump directly to a provider.

Parts: deck, four feet, groove, four screws, archive cabinet, cabinet lid,
two lid hinges, original sleeve, original retention clip, source-card holder,
three source cards, mapping bed, two mapping rails, four mapping teeth,
profile slider, slider knob, template holder, two template version plates,
template registration pins, generation bed, two press posts, upper crosshead,
two bearing blocks, printing roller, two roller collars, pressure cap,
output tray, two output guides, derived PDF stack, provenance tab,
inspection stand, inspection window, scan clip, two travel rails,
three rail supports, sample carriage, sample PDF, paper rules,
four press fasteners, three ventilation slots, drawer handle.

Generated outputs and postal-address-page derivatives have separate identities
and provenance. Original uploads stay byte-for-byte intact. Derivation does not
replace scanning, review, immutable approval or dispatch authority.

## Source and maintenance

Facts come from `docs/ARCHITECTURE.md`, `packages/domain/`, `packages/data/`,
`packages/templates/`, the document/template services and Wrangler bindings.
The vendored MIT Anatomy kit is pinned to upstream commit
`1482e8469b0a9e0d8cc18ea2740a01423d29ae80`.

Regenerate isometric SVGs with `node apps/engineering/src/components/diagrams/build.mjs`;
append `--audit` for the measured geometry audit. Mermaid sources live beside
the exported SVGs; `render-mermaid.mjs` uses the pinned Mermaid CLI and an
existing Chromium. Keep semantics and source diagrams updated together.
