# Apple interface audit — 22 September 2026

This audit compares native sources with Apple guidance consulted on that date,
including WWDC26 changes. Design recommendations, product requirements and
submission evidence remain separate.

## Liquid Glass and navigation

Apple reserves Liquid Glass for controls and navigation above content. Lists,
documents and content backgrounds should not receive decorative glass.
Custom effects should remain rare.
[HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

Guteneo uses SwiftUI `TabView`, `NavigationStack`, toolbars, sheets and forms.
No artificial background replaces system bars; no `glassEffect` is applied
to PDFs or cards. Standard components adopt recent rendering with the
appropriate SDK/system and adapt to transparency and motion preferences.
`Paper` backgrounds belong to content. The iOS 17 fallback remains the system's.
[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass).

The 2026 announcements state that apps adopting Liquid Glass receive readability
and material refinements on version-27 systems; Xcode 27 removes the old-design
option. This does not instruct adding glass to every view. The project contains
no visual-compatibility key disabling the new design.
[Platforms State of the Union 2026](https://developer.apple.com/videos/play/wwdc2026/102/).

## iPad window and adaptive composition

Reviewing initial captures exposed a composition problem: workspace rows
stretched across the window while information remained on the left. The new
view separates recent activity and documents into two areas when available
width and text size permit. The welcome screen pairs copy with a letterpress
illustration, separate from the signature. Content remains scrollable with a
bounded reading measure. No total count is invented from loaded pages.

Documents and Dispatches use `NavigationSplitView`: a selectable list and detail
with a system fallback in compact space. Column widths are preferences
negotiated by SwiftUI. Selection has its own loading/presentation state;
switching documents must not retain the previous PDF or actions. Reading the
original PDF remains explicit, without decorative downloading of the entire
list.
[NavigationSplitView](https://developer.apple.com/documentation/swiftui/navigationsplitview).

Apple recommends preserving orientation cues during resizing and checking
intermediate widths. Landscape orientation alone does not qualify a narrow
window. Guteneo thresholds and widths are design choices, not Apple-mandated
dimensions. Two columns are not themselves an App Review acceptance condition.
[HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[HIG Split views](https://developer.apple.com/design/human-interface-guidelines/split-views).

## Motion and action feedback

Navigation, column changes and sheets retain system transitions. Success
feedback follows only an actual document-upload response; it does not mean a
fax was sent. Content adds neither looping animation nor artificial waiting.
The privacy overlay applies immediately, without a fade exposing data.

Apple recommends brief, useful motion accompanying an action or explaining a
change. Future custom animation must respect `accessibilityReduceMotion` and
provide an alternative without displacement. System component behavior does
not replace device qualification of accessibility preferences.
[HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion),
[accessibilityReduceMotion](https://developer.apple.com/documentation/swiftui/environmentvalues/accessibilityreducemotion),
[SensoryFeedback.success](https://developer.apple.com/documentation/swiftui/sensoryfeedback/success).

## Brand and icon

“At most one signature per screen” is a product requirement. The duplicate
welcome portrait plus independent symbol was removed. One signature combines
the transparent halftone portrait and `guteneo` wordmark on welcome, workspace
and About. Loading, PDF, form and privacy overlays add no logo. During system
login, the welcome logo is hidden visually and from accessibility.

The 512 × 512 portrait source PNG uses a palette with `tRNS` transparency:
alpha 0–255, 64,315 fully transparent pixels out of 262,144, and transparent
corners. `AppIcon.icon` retains this halftone portrait in an RGBA foreground
on opaque ivory paper covering the canvas. It does not duplicate the logo.
Xcode's 1024 × 1024 iPhone/iPad renders are opaque; system-masked previews
have transparent corners. The Icon Composer project, sources and previews
are recorded in [Art/IconComposer](../Art/IconComposer/README.md). The old
classic catalog remains in the repository; the build selects
`AppIcon.iconstack`. Distribution-icon opacity justifies no opaque panel
around interface logos.
[HIG App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons),
[Create with Icon Composer](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer),
[App Store Connect: add an icon](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon).

## Readability and accessibility

Text follows system styles and Dynamic Type; the portrait scales from 64 to
88 points. Every state has a label and symbol. Small failure/unknown-outcome
text now uses adaptive `Ink` for predictable readability; no unperformed
measurement of the old orange is claimed. Tests calculate contrast from
catalog-loaded colors in light/dark and normal/high-contrast modes. The
chosen small-text threshold is 4.5:1.
[HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

Native controls retain system behavior; tests do not replace VoiceOver use.
Reduce Transparency, Reduce Motion and the iOS 27 Liquid Glass slider have
not yet received a full manual campaign. No UIKit ordering or tab-overlay
change is inferred from the previous intermittent failure.

## Qualification of this change

Dedicated campaign results and captures are recorded in
[Screenshots/README.md](Screenshots/README.md). Fixtures are exclusively local
and fictional. Automated counts concern signatures exposed in the accessible
tree; visual review complements that check.

`Ink/Paper`, `Ink/Surface`, `Cobalt/Paper` and `Cobalt/Surface` ratios are
15.78, 17.07, 5.92 and 6.41 in light mode, and 16.10, 14.04, 7.92 and 6.91
in dark mode. These values concern opaque catalog colors, not variable
Liquid Glass bar composition.

The privacy-overlay source also hides underlying content and accessibility.
The PDF scenario checks return from background. It proves neither the exact
image iOS captures for the app switcher nor actual authentication rendering
on a physical device. Production Auth0 has its own server-managed branding;
its old opaque logo is a separate gap described in
[IOS_PASSKEYS.md](../../docs/IOS_PASSKEYS.md). Transparency verified here
concerns native-binary resources.
The audit is neither App Review acceptance nor publication.
