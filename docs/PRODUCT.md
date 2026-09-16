# Guteneo product contract

Guteneo transmits documents by fax (Telnyx), email (SES) and physical post (independent provider). REST, MCP and the French dashboard invoke the same domain operations. One dispatch means one recipient and channel. No automatic channel substitution.

Accepted journeys: (A) exact immutable imported PDF; (B) explicitly generated PDF from standalone HTML; (C) sanitized HTML plus text email; (D) named multichannel campaign referencing shared documents and validated CSV recipients. A human reviews content, destinations, options and bounded cost before durable acceptance. Simulation is always labelled and consumes a separate test ledger.

Discovery plan: configurable test credits; no funded physical sends. No marketing rates are published. Production sending remains disabled until sender, scanning, identity, supplier and operational checks are completed and authorized.

First vertical: two isolated local fictional organizations, PDF import/render, preparation, authenticated browser approval, atomic reservation/outbox, at-least-once-safe simulated processing, per-channel outcome and timeline. Subsequent modules add real adapter contracts and deployment operations. Live assistant compatibility requires actual client evidence.
