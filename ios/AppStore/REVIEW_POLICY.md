# iOS publication policy — Guteneo

State as of 22 September 2026. Apple sources were consulted on that date.

This folder prepares a first free native iOS companion to Guteneo. It is
neither Apple approval nor evidence that the app is submission ready. The
mobile backend is under local development and is not deployed. `fr-FR` text
is candidate listing copy to compare against the binary and actually available
capabilities before publication.

## Chosen policy for every storefront

The app offers no purchase, credit top-up, top-up price, payment button,
billing screen or top-up link. It also does not display “credit top-up
unavailable, see guteneo.com”. This applies to errors, help, captures and
metadata too.

The existing balance and an operation's exact or capped cost remain visible
when they explain whether sending is possible and what will be consumed.
Recommended insufficient-balance message:

> The available balance does not cover this dispatch.

Do not append an address, purchase invitation, QR code, search instruction or
promotional notification. Do not redisplay an unadapted server message that
contains such an invitation.

Useful links lead to their precise destinations: support, privacy, terms and
account deletion. They are not indirect purchase journeys. Check web pages
opened for login or approval too, particularly with insufficient balance.

## Basis and limits of the analysis

The [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
cover digital purchases in 3.1.1. Rule 3.1.3(f) permits a free companion to a
paid web tool without purchases or external inducements. This is Guteneo's
proposed position to explain to App Review; it is not preapproved.

Rule 3.1.3(e) concerns goods/services consumed outside the app. Applying it
to physical mail appears justified. Apple does not explicitly classify fax
under that rule. A wallet shared with digital services does not imply a
blanket exemption. Guteneo is not presented as a reader app.

External calls to action are permitted in the US storefront without an
entitlement. Elsewhere, plain text may also be an inducement. “See guteneo.com”
next to credit therefore presents a risk; removing a clickable link does not
resolve it. The chosen international policy avoids those regional differences.

This is an operational interpretation. Final service classification remains
subject to Apple's review. Address Apple requests explicitly without hiding
the business model or changing behavior only for the reviewer account.

## European Union: 1 October 2026 transition

On 18 August 2026 Apple published unified terms announced to take effect on
1 October 2026. Previous terms remain usable until then. Replacing them
requires the Account Holder to accept the updated agreement. Recheck the
applicable rule on the submission date.
[Official transition](https://developer.apple.com/support/apps-in-the-eu/)

The announced regime requires an entitlement for external offers, even without
an actionable link. Actionable journeys require StoreKit APIs and system
disclosures. Conditions concerning minors, commissions, reporting and
maintenance of payment options for twelve months apply. This Guteneo version
requests no such entitlement; no regional permission is presumed granted.
[EU payment options](https://developer.apple.com/support/payment-options-on-the-app-store-in-the-eu/)

## Journey presented to users and App Review

The target is a native SwiftUI interface for tracking, PDFs and preparation
of account-supported operations. The PDF reader displays the actual relevant
document. Unavailable, analyzing, failure and expiry states remain understandable.

Human approval stays in the system browser. It binds immutable content,
recipient, options and cost. App preparation is neither human agreement nor
dispatch. Do not embed the HTML dashboard in a WebView, enable expert delegation
or bypass existing checks to shorten the flow. A preparation-only quote remains
a reference quote; the interface must not invite approval or dispatch when
the server does not permit them.

Fax/email features respect account capabilities and production blocks. A
visible demonstration option does not prove real availability. Review notes
explain every closed channel. Do not promise postal sending in the initial
version without evidence of that journey in the submitted binary.

The demonstration uses identified fictional data without real communication.
Captures come from the tested binary. They expose no real documents and do
not present a simulated outcome as delivery.

## Account and privacy

Planned login uses Guteneo accounts. Check the actual Auth0 options:
using Auth0 infrastructure alone does not prove social login is offered.
Reassess rule 4.8 if social login is added. Privacy remains readily accessible
under 5.1.1.
[Login and privacy rules](https://developer.apple.com/app-store/review/guidelines/)

The client uses `ASWebAuthenticationSession`, presented by iOS from the app,
with a controlled return to the app. It does not redirect to the default
browser through `openURL` for login. Apple documents this system mechanism
for web authentication; its account-deletion FAQ criticism of default-browser
redirection does not describe this journey.
[System authentication](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service)

If the app permits account creation, including through the browser, it must
let users initiate deletion. Deactivation, logout or mandatory support email
is insufficient for an ordinary app. Confirmation and reauthentication are
allowed. If deletion finishes on the web, provide a direct link to the actual
journey. Explain legally retained data and processing time.
[Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

Base privacy details on observed flows: identity, contact information,
recipients, documents, support requests and any history. Declare actual
technical recipients and uses; do not select “no data collected” merely
because iOS code includes no advertising tool. Free-form document content
does not justify inventing every data category a user might enter.
[Privacy declarations](https://developer.apple.com/app-store/app-privacy-details/)

Check the privacy manifest, APIs requiring reasons and every SDK actually
included in the archive. Meet requirements for Apple's listed SDKs, including
signatures where applicable.
[Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)

## Submission conditions still requiring evidence

This table is a starting point, not a pass certificate. Each condition needs
dated evidence matching the final binary.

| Condition | Required evidence before submission |
| --- | --- |
| Mobile backend | Deployed accessible version; binary-compatible contract; verified account separation and access refusal. This folder attests no deployment. |
| Authentication | System login, browser consent, exact return, login/logout and expiry tested with a real authorized account. The client reuses service authentication; no embedded secret. |
| Account deletion | Complete journey and actual deletion of applicable data, access revocation and documented legal retention. |
| Business journey | PDF import/viewing, preparation, browser approval and return to tracking verified; errors/unavailable channels explained. No real communication without separate authorization. |
| Credits | Absence of top-ups and purchase inducements verified in the app, errors, links, approval pages and captures. |
| Device and accessibility | Physical-device, small/large screen, supported iPad, enlarged text, VoiceOver, keyboard, contrast and reduced-motion tests. |
| Build | Xcode 26 or later with iOS 26 SDK or later, required since 28 April 2026. SDK alone does not set the minimum supported iOS version. |
| Distribution | Confirmed bundle ID/team, signed distribution archive, archive validation and same-build TestFlight installation. |
| App Review access | Dedicated authorized usable account, tested instructions and backend reachable throughout review. No invented credentials. |
| App Store listing | Binary-matching copy, in-use app captures with fictional data, final icon, category, availability, age questionnaire, contact and active legal links. |
| Declarations | Privacy/encryption assessed on the final archive; supporting evidence where required. |
| Publication | Explicit user agreement before submission/publication or an external change requiring it; final App Review decision separate from local preparation. |

Practical sources: [minimum SDK](https://developer.apple.com/news/upcoming-requirements/),
[App Store captures](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots),
[encryption](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance),
[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

Do not claim ready to publish while a mandatory condition lacks evidence.
Simulator build, local archive, TestFlight installation and App Review approval
are different evidence levels.
