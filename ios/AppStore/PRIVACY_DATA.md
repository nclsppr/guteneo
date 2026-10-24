# Privacy: iOS candidate data

Local source state as of 22 September 2026. This inventory prepares the App
Store Connect listing; it replaces neither the service's public privacy policy
nor a declaration already submitted to Apple.

## Manifest declarations

`Guteneo/Resources/PrivacyInfo.xcprivacy` declares app functionality as the
purpose for the following account-linked categories, without advertising
tracking:

| Apple category | Corresponding flow |
| --- | --- |
| Name | Account profile, organization and sender/recipient identities. |
| Email address | System-browser login and email preparation or tracking. |
| Phone number | Fax recipient and sender. |
| Physical address | Viewing recipients of letters already in the account. |
| User identifier | Session and association with the authenticated organization. |
| Emails or text messages | Subject and body of prepared or viewed emails. |
| Other user content | Uploaded PDFs, filenames and document content. |
| Purchase history | Service operations, quotes and dispatch costs. The app collects no payment-card data. |

Reading existing letters justifies including postal data even though this
version does not prepare letters. Free-form PDF content is not used to infer
sensitive categories or an advertising profile. This inventory does not claim
that documents cannot contain personal data.

The project includes no third-party SDK, advertising or analytics tool. The
manifest declares no tracking domain. It declares UserDefaults access with
reason CA92.1 to retain the welcome language choice in this application's
private domain. The account preference remains separate and is synchronized
by the server. Repeat the inventory if dependencies or listed APIs are added.

## Device storage and access

The native token is stored in Keychain, accessible only while the device is
unlocked and without synchronization between devices. The network client uses
an ephemeral session without disk cache, cookies or HTTP credential storage.
It refuses redirects for authenticated requests.

PDFKit reads PDFs in memory. The app uses the system Files picker; it requests
no contacts, photos, camera, microphone or location access. An overlay covers
application views and presentations when the scene becomes inactive. It does
not claim to prevent deliberate screenshots, control the system browser or
erase source files in Files.

## Finalization before submission

- Validate this inventory against the final archive and actually deployed
  service flows, including logs and processors. The bundled manifest and
  App Store Connect listing are separate declarations.
- The 21 September public policy, checked at
  `https://guteneo.com/privacy/`, already covers the service, accounts,
  authentication and providers. Include native-client specifics when it
  launches and qualify its deployed flows.
- Apply the published retention criteria, define operational handling for
  shared accounts and qualify actual deletion in
  [ACCOUNT_DELETION.md](../../docs/ACCOUNT_DELETION.md).
- Supply contact details and regulatory answers using the service controller's
  information; invent no legal retention period or identity.

Apple references: [app privacy details](https://developer.apple.com/app-store/app-privacy-details/),
[privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files),
[account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

The UserDefaults reason was checked in [Apple's approved-reasons documentation](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons).
