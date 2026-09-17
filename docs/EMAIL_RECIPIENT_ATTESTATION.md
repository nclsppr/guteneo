# Email recipient attestation

Production email approval now requires a separate, initially unchecked browser confirmation that the recipient requested the message and document. The API accepts a strict boolean `recipientRequested`; only an authenticated browser actor can create approval. Assistants cannot supply human approval through MCP or OAuth.

The statement is retained on the approval row with its user, timestamp, expiration and exact dispatch fingerprint. Any recipient/content change needs new approval; the browser also clears both checkboxes when the fingerprint changes. Migration0018 independently rejects production email queue acceptance without the statement and checks it again before provider submission. Existing approvals default to false and cannot silently authorize email.

This is the sender's attestation, not independent evidence that the recipient consented. It complements verified accounts, human review, suppression, quotas and operator handling of stop requests. Marketing remains disabled. It does not enable a channel or qualify a sandbox recipient in AWS SES.

No remote migration, real delivery or public beta activation is implied by this implementation.
