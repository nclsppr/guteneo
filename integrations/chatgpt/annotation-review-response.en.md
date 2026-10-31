# Draft response — not sent

This draft describes local remediation only. Do not change it to claim a
deployment, portal rescan or resubmission until those actions have been verified.
The annotation matrix is an internal evidence document, not an official portal
import file. Do not attach reviewer credentials or account data.

---

Hello,

Thank you for the feedback on Guteneo v0.3.2. We have audited the current server
implementation and prepared a local remediation candidate.

The current local MCP catalogue exposes 67 tools. All four hint fields are
explicit booleans for each tool. We have prepared a complete per-tool matrix
explaining each value and citing the relevant implementation. We also found
that our previous local justification table omitted `dry_run_dispatch`.

The candidate changes two destructive annotations:

- `review_dispatch`: issuing a new review token invalidates the previously valid
  token for the same dispatch and connection.
- `prepare_distribution`: creating the immutable distribution plan permanently
  prevents retrying failed records in the original generation job, including
  records excluded from that plan.

We have clarified the related descriptions. Business retrieval tools now advertise
`readOnlyHint: true` and `idempotentHint: true`: the connection's last-used time,
refreshed after any successful call, is connection metadata rather than an effect
of these tools. The candidate does not relax authorization or approval
requirements.

These findings concern our current source; they do not establish which exact
tool or scan caused the v0.3.2 rejection. Before resubmission, the corrected
server metadata must be deployed, rescanned and reconciled with the portal
justifications.

Could you identify the affected tool names, annotation fields, and the scan
or metadata revision examined during the rejected review? This would let us
verify the remediation against the exact reviewed snapshot.

Best regards,
The Guteneo team
