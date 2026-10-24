# Native design direction — Guteneo

The web frontend defines the identity; iOS conventions define interaction.
The application uses SwiftUI, Apple controls, a native PDF reader and the
Files picker. It does not wrap the HTML dashboard in a WebView.

## Identity and hierarchy

Preserve the **guteneo** wordmark with its lowercase `g`. One signature
combines the transparent halftone portrait and wordmark. It appears on the
welcome screen, workspace and About, at most once per screen. Do not add a
second symbol, opaque panel or another logo inside a sheet. Loading and
privacy overlays contain no logo; the welcome signature disappears during
system authentication. The portrait measures 64 points and follows Dynamic
Type up to 88 points.

The system launch icon is a separate resource: the native `AppIcon.icon`
document places the halftone portrait once on ivory paper covering the
canvas. Xcode produces the opaque App Store bitmap and system variants.
This requirement does not apply to the transparent interface portrait.
Preparation and renders are documented in [Art/IconComposer](Art/IconComposer/README.md).

The asset catalog carries adaptive colors:

| Role | Light | Dark |
| --- | --- | --- |
| Paper | `#F6F5EF` | `#17191E` |
| Ink | `#181B22` | `#F6F5EF` |
| Cobalt accent | `#2450DB` | `#90ABFF` |

Surfaces use `Surface` and system semantic colors. Editorial headings use
the serif system-font variant; forms, lists, amounts and actions use iOS
text styles. Sizes remain tied to Dynamic Type. Do not turn forms into
posters or add decorative glass effects to documents.

## The print workshop

The welcome screen and workspace evoke a printer's workbench: warm paper,
serif headings, subtle rules, and documents and dispatches in a useful order.
Lists and forms retain native behavior. Personality comes from editorial
content and illustration, without multiplying frames, emblems or decoration.

`PrintWorkshop` is an original manual-press illustration with a blank sheet
and printing tools. It contains no text, logo or user document. Its transparent
background belongs to the content layer, not navigation. Reserve it for the
welcome screen and workspace; empty Documents and Dispatches detail views
use an SF Symbol and practical guidance. The illustration replaces no
information, is hidden from VoiceOver and intercepts no gestures.

Its electric blue matches the actual portrait: `#0033F9` appears in its
pixels, with allowed shades for hatching and engraving. This reference changes
neither logo pixels nor adaptive control accents. Preserve ivory surfaces and
illustration transparency, without template rendering, halo or panel.
File provenance and checks are recorded in [Art/README.md](Art/README.md).

The welcome screen and workspace use two columns when available width reaches
800 points, horizontal size class is `regular` and Dynamic Type is not using
an accessibility size. The condition is the current window, not device model
or orientation alone. The workspace then places recent dispatches beside
recent documents. Narrow windows or accessibility sizes return content to a
scrolling vertical order. The workspace illustration disappears in that
layout; the welcome screen may keep a smaller version outside accessibility
sizes.

## Navigation and actions

Four stable tabs: **Workspace**, **Documents**, **Dispatches**, **Account**.
Workspace and Account use a native navigation stack. Documents and Dispatches
use `NavigationSplitView`: list and detail side by side when the window permits,
with compact navigation and native back behavior managed by the system as it
narrows. The list column suggests 340 points within a 280–420-point range;
it imposes no window width. Explicit selection opens the detail, without
arbitrary preselection.

Selection uses the document or dispatch identifier. The detail stack's `.id`
renews loading and presentation state when that identifier changes: an old
sheet or content must not become associated with a new item. An item absent
from a refreshed page or filter is not assumed deleted. Opening a detail loads
its metadata; downloading the PDF requires the explicit “Read original PDF”
action.

Dispatch preparation opens in a sheet; fields, errors and actions remain
visible with the keyboard and enlarged text.

Tabs, toolbars and sheets use SwiftUI's native materials: Liquid Glass on
recent systems and compatible system rendering on iOS 17. Do not draw fake
glass or impose custom bar backgrounds. Documents, lists and forms belong to
the content layer and retain readable backgrounds. iOS 27 refinements and
transparency preferences are left to the system.

The primary action prepares an operation. Human validation opens the system
browser and remains separate from preparation. Its label explains the next
step without implying a dispatch has already happened. Channel changes must
never be implicit.

## Documents and states

Show the document name, page count, verification state and actual content
before an operation. Unavailable, still-processing or rejected PDFs need an
actionable explanation. Do not equate quarantine with confirmed infection
or hide failure behind an endless spinner.

Lists distinguish waiting, processing and confirmed outcomes. Pair an icon
and text with every state; color alone is insufficient. Failures and unknown
outcomes use adaptive ink to preserve small-text contrast; symbols and labels
carry their meaning. An unknown provider outcome must neither appear as a
certain failure nor encourage resending that could create a duplicate.

## Accessibility and adaptation

Use standard buttons, links, lists, tabs, forms and sheets. Preserve comfortable
touch targets and explicit VoiceOver names. Decorative illustrations are hidden
from assistive technology; row information follows a logical reading order.

Check long filenames and addresses, accessibility sizes, dark mode, compact
iPhone, landscape iPad and return from the browser. Limit animation; every
added animation respects Reduce Motion. Transitions come from system navigation
and presentations. Success haptics accompany only a successful PDF upload,
after its identifier arrives; they simulate neither progress, document
verification nor dispatch. Add no systematic bounce or extra sound. Newer
system effects retain an iOS 17 fallback. Do not claim VoiceOver or device
validation before an actual test.

While inactive, the privacy overlay also hides content from accessibility
and disables its interactions. Its lock and text are not another brand
signature. The welcome signature retains its layout position but becomes
invisible and inaccessible during system authentication.

## Credits and evidence

An operation's cost and existing balance may inform a decision. No screen
offers to add credits or find a purchase destination. Insufficient balance
explains the block without a commercial invitation.

Debug previews remain explicitly fictional and perform no real dispatch.
Their interface is not evidence of server availability. Publication captures
must come from the final binary, show fictional data and describe only
features actually delivered.
