---
title: "iPhone and iPad"
description: "9 capabilities in the interfaces branch of Guteneo."
sidebar:
  order: 16
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Local candidate; distribution needs separate proof.

Native candidate; physical-device, signing and distribution qualification remain separate.

**Surfaces:** Native SwiftUI client and versioned mobile API; authenticated browser for final approval.

[Read the engineering guide](/getting-started/repository-map/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-b36c4429bd66">System authentication with dedicated mobile sessions</li>
<li id="feature-de79d451e881">Adaptive iPhone/iPad navigation and accessibility; English source keys with 261 preserved four-language native translations</li>
<li id="feature-fc891a249816">Profile, language and account-deletion request</li>
<li id="feature-7f4db052e580">PDF import, inspection and search</li>
<li id="feature-f0840562e65c">Fax/email preparation and tracking</li>
<li id="feature-1ff8c21c0522">Final review in an authenticated browser; native sessions cannot grant consent</li>
<li id="feature-d6226616b6d5">Signing, physical-device, TestFlight and App Store qualification remain separate</li>
<li id="feature-c830e7574c6e">Read preferredDashboardAppearance in account/session without a native setting/PATCH</li>
<li id="feature-edfe469d3ddd">Swift opens canonical /auth/mobile/authorize; the server selects the configured browser domain and preserves mobile PKCE return, distinct from the native callback</li>
</ol>
