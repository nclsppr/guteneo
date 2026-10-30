---
name: Belvédère — guteneo
description: The visual system of guteneo's private, read-only control tower.
colors:
  cobalt: "var(--blue)"
  action: "var(--action)"
  action-hover: "var(--action-hover)"
  paper: "var(--paper)"
  surface: "var(--surface)"
  ink: "var(--ink)"
  heading-ink: "var(--heading-ink)"
  muted: "var(--muted)"
  line: "var(--line)"
  field-line: "var(--control-line)"
  sidebar: "var(--sidebar-surface)"
  navigation-selected: "var(--blue-tint)"
  evidence-green: "var(--success)"
  warning: "var(--warning)"
  warning-surface: "var(--warning-tint)"
typography:
  display:
    fontFamily: '"EB Garamond", Georgia, serif'
    fontSize: "38px"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"IBM Plex Sans", sans-serif'
    fontSize: "18px"
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
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.035em"
rounded:
  compact: "3px"
  control: "7px"
  panel: "12px"
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
    padding: "10px 16px"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "white"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "white"
  button-text:
    textColor: "{colors.cobalt}"
    padding: "0"
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 36px 10px 12px"
  search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  navigation-selected:
    backgroundColor: "{colors.navigation-selected}"
    textColor: "{colors.cobalt}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  status-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    rounded: "{rounded.compact}"
    padding: "4px 7px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Belvédère — guteneo

## Overview

Belvédère carries guteneo's printing-house identity into a quiet private workspace. Warm paper, the existing cobalt mark and restrained serif headings give context to precise operational data. The shell follows the workshop V2
geometry and shared theme tokens, preserving separate platform authority. Its density comes from aligned rows, compact controls and clear separators, with room around the principal headings and figures.

This document applies only to the private Belvédère control tower. It records the V2 alignment source follow-up in `apps/web/src/belvedere.css`, `belvedere-globe.css`, `belvedere.tsx` and `belvedere-globe.tsx`; it does not establish a design system for the public site or assert a production release. [The product contract](../PRODUCT.md) and [Belvédère's functional contract](../BELVEDERE.md) remain the sources for access, data meaning and read-only behavior.

**Key Characteristics:**

- The approved guteneo portrait and lowercase wordmark, using ink in light mode and ivory directly on dark surfaces. The stamp retains white paper inside its frame and a transparent exterior.
- Editorial headings paired with compact, tabular operational data.
- Cobalt for interaction and selected data; green and amber for stated evidence or status.
- Flat framed surfaces with limited depth for selected controls, the mobile drawer and the globe.
- Responsive layouts, accessible data alternatives and user-driven exploration.

## Colors

The palette combines warm neutral surfaces with a single cobalt accent; semantic green and amber identify evidence and attention states.

### Primary

- **Cobalt** marks active navigation, actions and principal chart data. Visible
  keyboard focus uses the shared ink token, independently of pointer selection. Its darker hover companion gives primary buttons a clear response.

### Neutral

- **Paper** is the workspace canvas; **Surface** is the lighter ground for panels and fields.
- **Heading Ink** carries page headings and principal metrics; **Ink** carries section headings and ordinary content. **Muted** carries supporting labels, dates and explanations.
- **Line** separates regions without raising them. **Field Line** provides the slightly firmer outline around search and filter controls.
- **Sidebar** gives the persistent navigation a gentle tonal separation. **Navigation Selected** supports the cobalt current-page label.

Green and amber are semantic colors, not additional decorative accents. Evidence green accompanies production labels and positive notices. Warning text and its pale surface accompany simulation, unavailable or attention states as defined by the component.

**The Named State Rule.** Keep status and evidence words alongside color; the interface must still explain the state without interpreting a dot or tint.

## Typography

**Display Font:** EB Garamond with serif fallback.

**Body Font:** IBM Plex Sans with sans-serif fallback.

**Label/Mono Font:** IBM Plex Mono with monospace fallback for identifiers, country codes and globe coordinates.

The serif introduces the page; sans-serif section titles, including the globe,
carry the workshop V2 hierarchy. Sans-serif also carries actions, tables, labels
and most numbers. Tabular numerals align comparisons throughout the workspace. Headings use natural sentence case and restrained weight.

### Hierarchy

- **Display:** Page titles use 38 px on desktop, 36 px from 768 to 1024 px, and 34 px at 767 px and below. Titles identify the selected section directly instead of adding a tagline.
- **Title:** Medium-weight 18 px sans-serif headings organize panels and the globe.
- **Body:** Tables and ordinary controls use 14 px text; prose retains a generous line height.
- **Label:** Table headers and supporting operational labels use 12 px text. Counts and unavailable states remain readable and explicit.
- **Metric:** Tabular sans-serif totals retain the size needed for comparison within their responsive container.

**The Reading Roles Rule.** Use the serif to introduce a place or subject, and Plex Sans to compare, filter and act. Keep numerical columns aligned and explanatory text visually subordinate without treating tiny annotations as a default.

## Layout

The desktop shell is a two-column grid: a sticky 258px sidebar and a flexible workspace. The sidebar contracts to 232px between 1025px and 1150px. Main content is centered within a maximum width of 1450px, using 36px desktop gutters, 24px gutters on compact desktop, 22px from 768px to 1024px, and 16px at 767px and below.

The shared frame places page identity above filters and content. The overview presents totals, geography, activity and incidents in that order. Four metrics occupy a divided row on desktop and a two-column grid at 1024px and below. Supporting panels use asymmetric or equal two-column grids according to the information, with a recurring 20px gap and a 16px compact gap. The overview panel grid collapses at 940px; finance, connection and detail grids collapse at 1024px.

At 1024px and below, the shell becomes a single column with a sticky mobile top bar. A labeled menu button opens the navigation drawer. Filters wrap into available width, searches span the panel, and large tables scroll within their own region. The page itself should not acquire horizontal overflow.

The globe and its country ranking are side by side until 720px, where they stack. Its canvas height responds to space, while the ranking keeps a bounded local scroll region. A long ranking must remain reachable without expanding the entire globe panel.

**The Local Overflow Rule.** Preserve useful table columns and contain their horizontal scrolling inside the table region; adapt the surrounding controls to the viewport.

## Elevation & Depth

The workspace is flat at rest. Tonal shifts and thin borders define panels, fields, table sections and navigation. Selected segmented controls use small ambient shadows; the phone drawer uses a broader shadow to show its overlay position. The globe intentionally uses a shaded sphere and a soft cast shadow as part of the geographic representation. These treatments do not establish a general shadow for cards.

### Shadow Vocabulary

- **Selected activity control:** `0 1px 3px #20321812`.
- **Selected globe mode:** `0 2px 5px #2427220b`.
- **Mobile navigation drawer:** `12px 16px 30px var(--shadow)`.

**The Quiet Surface Rule.** Separate resting surfaces with tone and borders; reserve elevation for a selected control, an overlay or the globe's physical form.

## Shapes

Small corners preserve the printing-house character. Status tags and activity segments use the compact radius; common fields, buttons and globe mode controls use the control radius. Framed panels, including the globe, use the 12 px panel radius. Avatars, evidence dots and globe markers are circular because their role calls for that geometry; they do not make pill-shaped containers the default.

## Components

### Buttons

Controls are compact, lightly framed and explicit. The secondary button is the common action treatment; primary cobalt is reserved for the implemented access action. Text buttons connect summaries to detail.

- Secondary controls use the surface background, a thin outline and the control radius. Hover changes the surface and border tone.
- Primary controls use cobalt with white text and the darker cobalt hover state.
- Text actions use cobalt, adding an underline on hover.
- Interactive elements receive the shared ink focus-visible outline (2 px, offset 3 px). Navigation rows use a -2px inset so their scroll container does not clip the ring; the globe canvas uses a -6px inset. Pointer activation does not leave a keyboard ring.
- Disabled buttons lower opacity and show the unavailable cursor. Do not remove their explanatory context.

### Inputs / Fields

Search and filter controls share a warm surface, compact sans-serif labels and a thin field border. Selects use an inline SVG chevron, leaving space for the value. Search and filter fields have a minimum height of 46 px; common action buttons and icon controls use 44 px. Field text becomes 16 px on mobile. Search supplies a visible label through its surrounding context or accessible name and preserves focus on the entire framed field.

### Navigation

Seven destinations share a labeled 21px icon-and-text row with a 44px minimum height. The current page combines a cobalt label, medium weight and a pale selected surface; all icons keep their regular stroke. The identity uses the shared `BrandMark` with the approved transparent portrait and the lowercase guteneo wordmark; preserve the asset rather than substituting a glyph.

The phone toggle uses a conventional menu icon, a close icon in its open state and the Belvédère label. Expanded state and opening/closing labels are exposed to assistive technology. Opening focuses the active navigation link; Escape closes the drawer and returns focus to the toggle. The navigation scrolls locally while the account footer stays reachable. A single localized light/dark `ThemeToggle` stays in page actions at all widths, outside the drawer. It follows the system by default and changes no account, data or platform authority.

### Cards / Containers

Panels have the shared surface, line border and modest panel radius. Ordinary panels use 24px padding, becoming 20px on compact desktop and phone layouts; the globe retains its separate canvas and ranking geometry. Section headings pair a title and concise context with any relevant count or action. Tables and notices belong to the panel's information hierarchy rather than independent floating cards.

### Status Labels / Notices

Compact rectangular labels pair a readable state name with its semantic tone. Notices use the same status vocabulary with an icon and sentence-length explanation. Simulation, missing measurements and unavailable results remain explicit. The local demonstration banner is a fixture disclosure, not an ornamental header pattern.

### Tables and Metrics

Tables use muted header rows, separators, aligned numeric cells and a subtle row hover. Primary row links can lead to a detail view; pagination and filters remain outside the scroll region. Totals use open divided rows rather than four raised cards. Secondary lines explain what a total measures.

### Globe and Country Ranking

The globe is a geographic view paired with equivalent HTML data. A segmented control chooses connections or distribution; country buttons share selection with the canvas, and distribution can open the corresponding dispatches. Unknown geography remains an explicit row rather than an invented marker.

The canvas supports dragging, arrow keys, Home and labeled rotation controls. The country ranking provides keyboard-accessible selection and values. Latitude/longitude annotations describe the camera; markers represent countries rather than precise person locations.

**The Paired Data Rule.** Every spatial view retains its text-based values and selection route; geographic exploration must not be the only path to the data.

The globe canvas, data selection, accessible alternatives and request lifecycle
are unchanged by this skin. The browser theme choice is host-local; Belvédère does
not save or override the account's Classic/V2 layout.

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
