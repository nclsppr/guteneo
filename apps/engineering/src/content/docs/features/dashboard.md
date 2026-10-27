---
title: "Workspace layout and browser appearance"
description: "22 capabilities in the operate branch of Guteneo."
sidebar:
  order: 18
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Authenticated browser session.

Classic/V2 account layout authority is unchanged. The initial 25 October theme integration and removal of decorative panels were published from main 03daa4136de8999cc79018f33f2a22038917c621. The personal Classic/V2 account and Belvédère visual follow-up requires its own exact-source release proof and grants no new business authority.

**Surfaces:** Authenticated web Classic/V2; native reads preference without a setter; no new business API/MCP authority.

[Read the engineering guide](/engineering/contributing/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-7a4ccbd0bd61">Full real-web Classic/V2 views with the same account, tenant, resources and operations</li>
<li id="feature-710246fc5db2">Account at navigation bottom, saved Classic/V2 layout beside language, applied after a successful profile save; mobile identity remains visible with the menu closed and its V2 profile link retains a 44 px touch target; role and detailed permissions live on My account; native mobile details closes synchronously on Escape before a queued toggle reaches React, preserving summary focus and keyboard activation</li>
<li id="feature-381a3c15fb47">Personal users.preferred_dashboard_appearance, migration 0053, V2 persisted for new accounts and used by browser fallbacks; existing saved Classic/V2 choices and cross-workshop/session/device reconciliation preserved</li>
<li id="feature-b0052b732cc5">Personal documents apply the same saved Classic/V2 account layout in a shell filling the available width with responsive gutters and readable internal form measures, with lightweight independent navigation; personal and workshop customization reuse small shared language/theme/layout controls, preserving personal-only access and existing guarded PATCH authority</li>
<li id="feature-55247ef6b5a3">Strict browser account PATCH with current authority, Origin/CSRF and field-name audit; every role changes only its own preference</li>
<li id="feature-f9b64da75268">Temporary appearance=v2/classic override accepts legacy atelier URLs, never persists server-side and clears after explicit appearance save or identity change; local cache is non-authoritative</li>
<li id="feature-0d9480f7a3c4">Existing activity/alerts precede introduction, otherwise a complete welcome; content preview precedes approval in reading/tab order</li>
<li id="feature-f782ed0bec1e">Stable PDF frame above dispatch-review and document-page verification-purchase consent across lazy module loading/render/error, keyboard-accessible internal scrolling and unchanged consent/data authority</li>
<li id="feature-b7d75dda5b8f">Consistent documents, preparation, review, tracking, assistants, account, studio, PDF verification, credits, tables and forms; Belvédère shares the V2 visual vocabulary while retaining distinct platform authority and read-only data; recursive diagnostics keep outer key/value columns and stack nested fields without zero-width values or page overflow</li>
<li id="feature-f6ae6cdc6735">One brand signature, workshop in navigation and no redundant V2 footer; service status near account and browser timezone near dates</li>
<li id="feature-c3aa6a7a246e">One page title, contextual detail back link and task-specific primary action; global New dispatch stays secondary and permission-aware</li>
<li id="feature-ee17fdbe452e">Generation introduction focuses on finding PDFs and makes clear that generation sends nothing</li>
<li id="feature-c05a54a82392">Official identity and real documents, metrics and controls remain; decorative DashboardArtwork panels and swallow styling are retired from overview, empty Documents and assistant introduction, without replacement illustrations</li>
<li id="feature-4d010bc7a846">Four-language labels; simulation notices only for simulated sessions</li>
<li id="feature-40f2190fa707">Same four roles, supervisor options, private access and consents; no new mandate, channel or business API/MCP tool</li>
<li id="feature-6a0d97700a37">Native account/session reads include appearance without a setter; existing name/language browser PATCH and native language PATCH remain compatible</li>
<li id="feature-3592a7c6fc50">Compact My documents navigation link with personal-space context, without an oversized separate card or repeated role panel</li>
<li id="feature-95ab56d401ce">Shared native file input with four-language authored chooser/empty text and literal filenames, keyboard validation and exact-byte upload semantics</li>
<li id="feature-a3ed99ce1fef">Desktop Safari select height and protected-link hint spacing; visible keyboard focus, selection and forced-colors states remain readable in both palettes</li>
<li id="feature-3c9dc64b011d">Public and personal headers and Belvédère page actions share one localized light/dark action icon at every viewport, defaulting to the operating system; authenticated personal Classic/V2 shells fill the available width with responsive gutters, while personal V2 follows workshop geometry without changing personal navigation, identity, document access or logout. Browser theme is independent of saved Classic/V2 layout, account language and role; document/PDF/email content retains original light-paper appearance and bytes</li>
<li id="feature-00b001b58242">Template-designer controls adopt the resolved shared palette in place while original template content, output geometry, bindings and PDF bytes retain their document contract</li>
<li id="feature-dc506efb74ab">V2 protected-email choice, review summary, email preview and PDF viewer frame share the existing 10 px panel corners; 7 px controls and original square PDF paper retain their distinct roles without extra API reads</li>
</ol>
