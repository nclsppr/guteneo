# Web applications

Guteneo's browser product is four applications: **Studio**, **Correspondence**,
**My documents** and **Belvédère**. Each one evolves on its own (code, styles,
loading and authority) and all of them follow one design system. This document
owns those rules. [`apps/web/applications.json`](../apps/web/applications.json)
records who owns each source file, and `npm run lint` enforces both sides
through [`scripts/check-applications.mjs`](../scripts/check-applications.mjs).

## The four applications

| Application    | Purpose                                                    | Authority                                       | Internal id |
| -------------- | ---------------------------------------------------------- | ----------------------------------------------- | ----------- |
| Studio         | Templates, data and generations                            | Current workspace membership                    | `studio`    |
| Correspondence | Preparation, review, sending, tracking and workspace setup | Current workspace membership                    | `workshop`  |
| My documents   | Documents received and personal copies                     | Personal session; no workspace required         | `personal`  |
| Belvédère      | Read-only platform observation                             | Its separate global authority, checked per read | `belvedere` |

Renaming an application changes its localized label only. Internal ids, routes
(`/app/...`, `/app/studio/...`, `/app/my-documents`) and API paths stay stable, as
[repository standards](REPOSITORY_STANDARDS.md) require.

## Ownership layers

Every file under `apps/web/src` belongs to exactly one owner:

| Owner           | Contains                                                                                                                                                                                                           | May import                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| One application | Its pages, components and styles                                                                                                                                                                                   | Itself and the shared layer                      |
| `shared`        | Design system (`theme.css`, `styles.css`, `fonts.css`, `dashboard-v2.css`), shared frame (application and workspace switchers, account menu), API clients, locale catalogs and components several applications use | The shared layer only                            |
| `public`        | Public website, sign-in and public tools                                                                                                                                                                           | Itself and the shared layer                      |
| `host`          | Composition root (`main.tsx`, `App.tsx`, `workspace-route-loader.ts`, SSR entry)                                                                                                                                   | Everything; applications only through `import()` |

Consequences:

- An application never imports another application. Code two applications need
  moves to the shared layer, with a name that says what it does, not who uses it.
- The shared layer never depends on an application or the public site, so a
  change inside one application cannot break another through a shared file.
- The host loads each application on demand, so an application's code and styles
  ship in its own chunks and one application's growth does not slow another.
- A new source file must be added to the manifest; an unowned file fails the check.

## Design rules

The shared frame and the design system are the only places that define how the
product looks. In every stylesheet owned by an application or by the shared
components (the design-system files excepted):

| Rule             | Meaning                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `raw-color`      | No hexadecimal, `rgb()`, `hsl()` or similar literal: use theme tokens, or `color-mix()` of tokens                         |
| `font-family`    | Only `var(--font-body)`, `var(--font-display)`, `var(--font-code)` or `inherit`                                           |
| `token-override` | Never redefine a root design token such as `--radius` or `--blue`                                                         |
| `shell-selector` | An application never restyles the shared frame (`.sidebar`, `.space-switcher`, `.workspace-navigation`, the account menu) |

Component-scoped custom properties (for example `--day-size`) remain allowed when
their values come from tokens. The visual vocabulary itself (portrait, blue rule,
typography, geometry, controls, tables and forms) is described in the
[design-system guide](../apps/engineering/src/content/docs/engineering/design-system.mdx).

## Exceptions are dated debt

`importExceptions` and `designExceptions` in the manifest record what does not
follow these rules yet, each with its reason and the way out. The check fails
when an exception grows, when a count falls below its allowance (lower it), and
when an exception no longer occurs (remove it). Never add an exception to make a
new feature pass; fix the boundary instead.

Current exceptions (29 October 2026): My documents is bundled with the host for
its first paint, the host loads one correspondence helper, the
Studio stylesheet also serves one correspondence rule, `locale.ts` refreshes
public sharing metadata, and a few chart colors, shadows and V2 radius overrides
remain in Belvédère, the film frame, the language menu and the protected reader.

## Checking

```
npm run lint                                   # ESLint, then the application check
node --test tests/security/check-applications.test.mjs
```

The fixture in `tests/fixtures/applications` proves that a cross-application
import, an eager application load and each design rule are refused.
