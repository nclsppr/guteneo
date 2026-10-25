---
title: "Roles and permissions"
description: "Human membership roles and connected assistant authority, from the shared feature source."
sidebar:
  order: 90
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

There are four human membership roles. A connected assistant is a separate OAuth actor, never a fifth membership role. The server rechecks current membership, independent supervisor permissions, scopes and any bounded expert mandate. Installing an integration or renewing tokens grants no extra authority.

| Capability | Administrator | Supervisor | Operator | Observer | Connected assistant |
| --- | --- | --- | --- | --- | --- |
| Read accessible workshop content | Yes | Yes | Yes | Yes | Current member + consented scopes + document access |
| Import and prepare | Yes | Yes | Yes | No | Current member + scopes + qualified channel/transport |
| Human approval and confirmation | Yes | Approval option | No | No | Cannot assert human consent; standard confirmation requires recorded browser approval |
| Expert review and acceptance | Browser grants a bounded mandate | No mandate administration | No mandate administration | No | Pre-existing active client-bound mandate + current role/scopes + exact review + host confirmations |
| Cancel prepared/queued dispatch | Yes | Approval option | No | No | Current approval authority + scope; never retries an unknown submission |
| Aggregate reports | Yes | Reporting option | No | No | Current role + scopes |
| Manage workshop or members | Browser only | No | No | No | No |
| Manage billing | Current browser administrator | No | No | No | No |
| Purchase a PDF verification | Current browser administrator + exact purchase + PDF access | No | No | No | No financial consent; history read only |
| Read/export PDF verification history | Current PDF access | Current PDF access | Current PDF access | Current PDF access | Current PDF access + documents:read |
| Edit a shared template | Resource edit right | Resource edit right | Resource edit right | No | Current member + template scope + resource right; AI also requires current transfer consent/revision |
| Publish/archive a template | Resource publish right | Resource publish right | Resource publish right | No | Current member + templates:publish + resource right |
| Manage template sharing | Resource share right | Resource share right | Resource share right | No | Current member + templates:share + resource right; revocation disclosed |
| Remove a template | Owner | Owner | Owner | No | Owner + current role/scopes |
| Cancel/retry a generation | Batch owner | Batch owner | Batch owner | No | Owner + generations:write; frozen batches cannot retry |
| Read private generated PDFs | Creator/context access | Creator/context access | Creator/context access | Explicit current document access | Owner/context authority; no general private-library access |
| Profile, language, own sessions and appearance | Own account in browser | Own account in browser | Own account in browser | Own account in browser | No browser account administration or appearance setter |
| Read responsible workshop contacts | Authenticated browser | Authenticated browser | Authenticated browser | Authenticated browser | No |
| Read public pages/errors/status | Public; no privilege acquired | Public; no privilege acquired | Public; no privilege acquired | Public; no privilege acquired | Public read only; no extra tool/authority |
| Configure Auth0/DNS/reviewer refresh | No authority from workshop role | No authority from workshop role | No authority from workshop role | No authority from workshop role | No business REST/MCP route; distinct authorised platform operator |
| Open global Belvédère | No authority from workshop role | No authority from workshop role | No authority from workshop role | No authority from workshop role | No; distinct verified browser Watchkeeper |
| Apply assistant content exclusions | No additional rights | No additional rights | No additional rights | No additional rights | Announce exclusions, stop known excluded content, request person-redacted copy; no automatic classification or web bypass |
| Use a personal account and received documents without a workspace | Personal principal, no workspace authority gained | Personal principal, no workspace authority gained | Personal principal, no workspace authority gained | Personal principal, no workspace authority gained | No personal access through workspace Bearer |
| Prepare sensitive distribution | Accessible source + preparation | Accessible source + preparation | Accessible source + preparation | No | Membership + dispatches:prepare + current connection; no invitation secret returned |
| Read a sensitive share and its audit | Current workspace approver | All with approval permission; otherwise own creations | Own creations | No | Same resource access + dispatches:read; no other recipient documents |
| Approve sensitive distribution | Browser + recent document session | Approval permission + browser + recent document session | No | No | No; expert mandate is insufficient |
| Confirm sensitive distribution after human approval | Current browser evidence | Approval permission + current browser evidence | No | No | Approver role + dispatches:send + existing sensitive browser evidence + host confirmation |
| Associate recipient with a stable account | Browser + document policy + independent verification | Approval permission + browser + document policy + independent verification | No | No | No |
| Revoke shared access without refund | Current authority | Approval permission | No | No | Approver role + dispatches:send; acquired personal copy retained |
| Read/export/delete another person’s personal copy | No, including workspace administrator | No | No | No | No |
| Keep or export one’s own received document | Personal principal + document policy + share permission | Personal principal + document policy + share permission | Personal principal + document policy + share permission | Personal principal + document policy + share permission | No; personal operation outside workspace OAuth |
| Read public browser reports | Public access without workspace privilege | Public access without workspace privilege | Public access without workspace privilege | Public access without workspace privilege | Public read only; no ingestion or business authority |
| Read monthly and daily consumption history | Yes | Reporting option | No | No | Current reporting rights + tenant-scoped REST read; no new MCP billing tool |

Read [authority and tenancy](/architecture/authority-and-tenancy/) for the enforcement model and [MCP](/integrations/mcp/) for assistant constraints.
