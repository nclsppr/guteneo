---
name: Belvédère — guteneo
description: The visual system of guteneo's private, read-only control tower.
colors:
  cobalt: "#2450db"
  cobalt-hover: "#1b3caa"
  paper: "#f5f4ee"
  surface: "#fffefa"
  ink: "#242722"
  muted: "#62665e"
  line: "#dedfd5"
  field-line: "#d3d7c9"
  sidebar: "#eeeee6"
  navigation-selected: "#e2e7f5"
  evidence-green: "#28654a"
  warning: "#8b4a17"
  warning-surface: "#faf0df"
typography:
  display:
    fontFamily: '"EB Garamond", serif'
    fontSize: "36px"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.027em"
  title:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.35
  body:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "14px"
    lineHeight: 1.45
  label:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "12px"
  metric:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.035em"
rounded:
  compact: "3px"
  control: "4px"
  panel: "5px"
spacing:
  micro: "4px"
  inline: "8px"
  compact: "12px"
  small: "16px"
  section: "20px"
  roomy: "24px"
  desktop-gutter: "36px"
components:
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "white"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-hover}"
    textColor: "white"
  button-text:
    textColor: "{colors.cobalt}"
    padding: "0"
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 27px 8px 9px"
  search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  navigation-selected:
    backgroundColor: "{colors.navigation-selected}"
    textColor: "{colors.cobalt}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  status-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    rounded: "{rounded.compact}"
    padding: "4px 7px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "23px 25px"
---

# Design System: Belvédère — guteneo

## Overview

**Creative North Star: "Tout voir, à la bonne hauteur."**

Belvédère carries guteneo's printing-house identity into a quiet private workspace. Warm paper, the existing cobalt mark and restrained serif headings give context to precise operational data. Its density comes from aligned rows, compact controls and clear separators, with room around the principal headings and figures.

This document applies only to the private Belvédère control tower. It records the current local candidate in `apps/web/src/belvedere.css`, `belvedere-globe.css`, `belvedere.tsx` and `belvedere-globe.tsx`; it does not establish a design system for the public site or assert a production release. [The product contract](../PRODUCT.md) and [Belvédère's functional contract](../BELVEDERE.md) remain the sources for access, data meaning and read-only behavior.

**Key Characteristics:**

- The real guteneo mark and lowercase wordmark on ivory surfaces.
- Editorial headings paired with compact, tabular operational data.
- Cobalt for interaction and selected data; green and amber for stated evidence or status.
- Flat framed surfaces with limited depth for selected controls, the mobile drawer and the globe.
- Responsive layouts, accessible data alternatives and user-driven exploration.

## Colors

The palette combines warm neutral surfaces with a single cobalt accent; semantic green and amber identify evidence and attention states.

### Primary

- **Cobalt** marks active navigation, actions, focused controls and principal chart data. Its darker hover companion gives primary buttons a clear response.

### Neutral

- **Paper** is the workspace canvas; **Surface** is the lighter ground for panels and fields.
- **Ink** carries headings and primary values; **Muted** carries supporting labels, dates and explanations.
- **Line** separates regions without raising them. **Field Line** provides the slightly firmer outline around search and filter controls.
- **Sidebar** gives the persistent navigation a gentle tonal separation. **Navigation Selected** supports the cobalt current-page label.

Green and amber are semantic colors, not additional decorative accents. Evidence green accompanies production labels and positive notices. Warning text and its pale surface accompany simulation, unavailable or attention states as defined by the component.

**The Named State Rule.** Keep status and evidence words alongside color; the interface must still explain the state without interpreting a dot or tint.

## Typography

**Display Font:** EB Garamond with serif fallback.

**Body Font:** IBM Plex Sans with sans-serif fallback.

**Label/Mono Font:** IBM Plex Mono with monospace fallback for identifiers, country codes and globe coordinates.

The serif introduces the page and the globe; the sans-serif carries actions, tables, labels and most numbers. Tabular numerals align comparisons throughout the workspace. Headings use natural sentence case and restrained weight.

### Hierarchy

- **Display:** The frontmatter records the standard page heading. It becomes 32px below 1150px, 29px below 940px, then 30px in the phone layout. The globe uses a related 30px serif heading, becoming 29px below 720px.
- **Title:** Medium-weight sans-serif section titles organize panels. Phone section titles become 15px.
- **Body:** The workspace base is the body role; prose uses a more generous line height of 1.6. Most operational rows and controls use the compact label size.
- **Label:** Compact sans-serif labels identify filters and metrics. Supporting notes are smaller in the incumbent code; their individual 9–11px values are not a reusable typography scale for new screens.
- **Metric:** Medium-weight sans-serif totals are visually distinct from their muted labels. Their responsive size follows available space; the globe summary has a separate serif treatment.

**The Reading Roles Rule.** Use the serif to introduce a place or subject, and Plex Sans to compare, filter and act. Keep numerical columns aligned and explanatory text visually subordinate without treating tiny annotations as a default.

## Layout

The desktop shell is a two-column grid: a sticky 218px sidebar and a flexible workspace. The sidebar contracts to 185px below 1150px. Main content is centered within a maximum width of 1640px, using the desktop gutter from the frontmatter; gutters become 24px below 1150px and 20px in the phone layout.

The shared frame places page identity above filters and content. The overview presents totals, geography, activity and incidents in that order. Four metrics occupy a divided row on desktop and a two-column grid on phone. Supporting panels use asymmetric or equal two-column grids according to the information, with a recurring 20px gap and a 16px compact gap. The overview collapses at 940px; finance and remaining detail grids collapse at 760px.

At 760px, the shell becomes a single column with a sticky 58px top bar. A labeled menu button opens the navigation drawer. Filters wrap into available width, searches span the panel, and large tables scroll within their own region. The page itself should not acquire horizontal overflow.

The globe and its country ranking are side by side until 720px, where they stack. Its canvas height responds to space, while the ranking keeps a bounded local scroll region. A long ranking must remain reachable without expanding the entire globe panel.

**The Local Overflow Rule.** Preserve useful table columns and contain their horizontal scrolling inside the table region; adapt the surrounding controls to the viewport.

## Elevation & Depth

The workspace is flat at rest. Tonal shifts and thin borders define panels, fields, table sections and navigation. Selected segmented controls use small ambient shadows; the phone drawer uses a broader shadow to show its overlay position. The globe intentionally uses a shaded sphere and a soft cast shadow as part of the geographic representation. These treatments do not establish a general shadow for cards.

### Shadow Vocabulary

- **Selected activity control:** `0 1px 3px #20321812`.
- **Selected globe mode:** `0 2px 5px #2427220b`.
- **Mobile navigation drawer:** `12px 16px 30px #242a2515`.

**The Quiet Surface Rule.** Separate resting surfaces with tone and borders; reserve elevation for a selected control, an overlay or the globe's physical form.

## Shapes

Small corners preserve the printing-house character. Compact tags and segmented items use the compact radius, common fields and buttons use the control radius, and framed panels use the panel radius. The globe's outer frame remains square. Avatars, evidence dots and globe markers are circular because their role calls for that geometry; they do not make pill-shaped containers the default.

## Components

### Buttons

Controls are compact, lightly framed and explicit. The secondary button is the common action treatment; primary cobalt is reserved for the implemented access action. Text buttons connect summaries to detail.

- Secondary controls use the surface background, a thin outline and the control radius. Hover changes the surface and border tone.
- Primary controls use cobalt with white text and the darker cobalt hover state.
- Text actions use cobalt, adding an underline on hover.
- Interactive elements receive a cobalt focus outline (2px, offset 4px); search uses a wrapper outline with a 2px offset.
- Disabled buttons lower opacity and show the unavailable cursor. Do not remove their explanatory context.

### Inputs / Fields

Search and filter controls share a warm surface, compact sans-serif labels and a thin field border. Selects use an inline SVG chevron, leaving space for the value. Phone filters have a minimum height of 40px. Search supplies a visible label through its surrounding context or accessible name and preserves focus on the entire framed field.

### Navigation

Seven destinations share a labeled icon-and-text row. The current page combines a cobalt label, a filled icon, a pale selected surface and a small end marker. The identity uses `/brand/guteneo-mark-128.webp` and the lowercase guteneo wordmark; preserve the asset rather than substituting a glyph.

The phone toggle uses a conventional menu icon, a close icon in its open state and the Belvédère label. Expanded state and opening/closing labels are exposed to assistive technology. Escape closes the drawer and returns focus to the toggle.

### Cards / Containers

Panels have the shared surface, line border and modest panel radius. Internal padding contracts with the viewport. Section headings pair a title and concise context with any relevant count or action. Tables and notices belong to the panel's information hierarchy rather than independent floating cards.

### Status Labels / Notices

Compact rectangular labels pair a readable state name with its semantic tone. Notices use the same status vocabulary with an icon and sentence-length explanation. Simulation, missing measurements and unavailable results remain explicit. The local demonstration banner is a fixture disclosure, not an ornamental header pattern.

### Tables and Metrics

Tables use muted header rows, separators, aligned numeric cells and a subtle row hover. Primary row links can lead to a detail view; pagination and filters remain outside the scroll region. Totals use open divided rows rather than four raised cards. Secondary lines explain what a total measures.

### Globe and Country Ranking

The globe is a geographic view paired with equivalent HTML data. A segmented control chooses connections or distribution; country buttons share selection with the canvas, and distribution can open the corresponding envois. Unknown geography remains an explicit row rather than an invented marker.

The canvas supports dragging, arrow keys, Home and labeled rotation controls. The country ranking provides keyboard-accessible selection and values. Latitude/longitude annotations describe the camera; markers represent countries rather than precise person locations.

**The Paired Data Rule.** Every spatial view retains its text-based values and selection route; geographic exploration must not be the only path to the data.

State transitions for ordinary controls last 160ms; chart opacity uses 130ms. Loading placeholders may pulse while data is loading. The globe has no idle rotation. Reduced-motion preference removes transitions and loading animation.

## Do's and Don'ts

### Do:

- **Do** preserve the real guteneo mark, lowercase wordmark and the private Belvédère scope.
- **Do** pair semantic color with a written state and keep data provenance or absence legible.
- **Do** keep the serif for introductions and Plex Sans for operational reading, with tabular numerals for comparison.
- **Do** keep table overflow local and provide the same geographic values through the country ranking.
- **Do** retain visible focus, named controls and reduced-motion behavior.

### Don't:

- **Don't** turn the globe's shaded material or the drawer's shadow into the default panel treatment.
- **Don't** replace labeled navigation or brand assets with decorative glyphs.
- **Don't** add idle globe motion or make canvas interaction the sole route to data.
- **Don't** imply a missing measurement is zero, a simulation is production evidence or a read-only action sends an operation.
- **Don't** promote isolated annotation sizes, fixture numbers or one-off visual values into reusable design tokens.
