# Assistants and direct sending — local candidate, 20 September 2026

The assistant journey extends the isolated homepage candidate. The existing
Luxembourg footer and homepage identity are retained. This document records
implementation and local validation; publication evidence is recorded
separately against the deployed source commit. No external assistant connection,
permission grant or real communication is performed by these checks.

## User journeys

- MCP setup is the primary installation journey. It does not depend on a
  Guteneo plugin being published in a host directory. Each guide separates
  "Installer par MCP" from the currently unpublished directory plugin.
  ChatGPT's Plugins menu can create a personal MCP connection; it is not
  evidence of public directory publication. The advanced ZIP download is
  explicitly labelled as a package for manual installation.
- `/assistants/` is public. Six guides cover ChatGPT, Claude, Grok, GitHub Copilot,
  Microsoft 365 Copilot and Cursor. GitHub Copilot has distinct VS Code and CLI
  instructions; Microsoft 365 is explicitly an administrator/agent workflow.
- Public guide pages are prerendered, have canonical metadata and appear in the
  public sitemap. Their interactive entry does not initialize browser session
  or capability requests. The same catalog and guide component serve the
  authenticated `#/app/connection/<assistant>` routes.
- Homepage and Luxembourg-footer primary actions lead to the starting choice.
  Visitors can use their assistant or prepare directly in Guteneo. Assistant
  logos link to individual guides.
- The dashboard places Assistants immediately after Overview in navigation and
  shows the initial choice before statistics. A direct-send preference hides
  the invitation, is scoped to user and organization in this browser, and can
  be reversed from Assistants. It is not a permission or a business setting.
- Sign-in and sign-up preserve the selected assistant or direct-send route.
  Preparation, review, consent, billing and provider gates are unchanged.

## Design rationale and implementation

The first choice answers a practical question: continue from an assistant, or
prepare directly in Guteneo. It appears before dashboard statistics so a new
visitor can start without interpreting an empty activity screen. Returning
users can dismiss this invitation through the reversible direct-send
preference. The ordinary navigation still exposes both routes.

The public directory and private workspace share one
[assistant catalog](../apps/web/src/assistant-catalog.ts) and the same
[picker and guide components](../apps/web/src/assistant-guides.tsx). A logo is a
link to instructions, with its product name as the accessible label. It does
not represent an installed or connected state. VS Code and Copilot CLI have
separate instructions; Microsoft 365 and Copilot Studio have separate agent
workflows. This prevents a familiar Copilot name from leading to the wrong
product's settings.

Guides follow a reading sequence: prerequisites, numbered installation steps,
the server address at the step where it is needed, a first read-only request,
troubleshooting, then the editor's source documentation. Each page has one
`h1`, section headings, native links and buttons, visible keyboard focus and
buttons with an explicit selected state for variants. Clipboard success is
reported locally; failure leaves selectable text and explains manual copying.
The first request excludes document creation, draft preparation, sending and
permission changes. It is offered for the user to copy, never run by the page.

The layout retains Guteneo's ivory paper, cobalt actions, EB Garamond headings,
Plex body copy and restrained rules. Monospace is used for the endpoint and
commands. Desktop guides place prerequisites beside the steps; small screens
put them in reading order in one column. The existing Luxembourg panorama,
founding postage, birds and footer title are retained. The footer's primary
action now reaches the same starting choice as the homepage.

The local styles live in
[assistant-guides.css](../apps/web/src/assistant-guides.css) and
[assistant-workspace.css](../apps/web/src/assistant-workspace.css). This is an
extension of the [homepage direction](HOMEPAGE_REDESIGN.md), with no replacement
global design system.

## Connection truth

Loading, an unavailable connection list, no authorization, active authorization,
revocation and a verified exchange are separate states. Selecting a logo,
copying a URL or prompt, or creating a manual association cannot create proof.
The connection list refreshes on return to the browser and by explicit action.

A verified exchange requires a successful authenticated MCP tool call observed
by the production service, bound to the authorization revision, user and tenant.
The UI displays its date. It does not infer which host owns an opaque OAuth
client ID or attach a success badge to the guide the visitor last selected.
A historical success does not prove all document transfers, sending routes or
current token validity.

The backend extension requires
[`0032_connection_tool_observations.sql`](../migrations/0032_connection_tool_observations.sql)
before publishing its Worker. Rebinding or revoking an authorization
invalidates the previous proof. Simulation and the public preview never
manufacture evidence.

The local candidate originally named this migration `0030`. Before publication,
it was renumbered to `0032` because `main` already contains the separate postal
migrations `0030` and `0031`. The dated test evidence below retains its original
migration number; the SQL behavior is unchanged.
After renumbering, the focused migration, authentication and postal-authority
suites passed all 50 tests locally on 21 September 2026. This run precedes the
candidate's reconciliation with the newer `main` and does not replace CI for
the merged commit.

## Guide sources and assets

The official instructions below were reviewed on 20 September 2026. They
establish documented setup paths, not live qualification of Guteneo in every
host or account. The catalog links these sources within the relevant guide.

| Product | Primary sources and constraint affecting the journey |
| --- | --- |
| ChatGPT | [Connect and test a plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [connection walkthrough](https://developers.openai.com/plugins/build/app-quickstart#connect-your-mcp-server-in-chatgpt). Developer mode and custom plugins must be available to the account or allowed by the workspace. The guide uses the conversation's tools menu without promising a directory listing. |
| Claude | [Custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). The documented Free limit is one custom connector. Team and Enterprise owners add the organization connector before members authenticate individually. |
| Grok | [Custom MCP connectors](https://docs.x.ai/grok/connectors) and [organization connector management](https://docs.x.ai/grok/connector-management). Personal custom connectors are documented on the web; organization connectors require administrator setup. The guide makes no unsupported promise about availability in every plan. |
| GitHub Copilot | [VS Code MCP setup](https://code.visualstudio.com/docs/agent-customization/mcp-servers), [Copilot Chat authentication](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp), [CLI setup](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) and [CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference). Separate IDE and CLI paths retain the existing configuration downloads; enterprise allowlists can restrict servers. |
| Microsoft 365 Copilot | [Build an agent plugin from an MCP server](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins) and [extensibility prerequisites](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/prerequisites). An agent creator prepares and installs a declarative agent under tenant permissions; this is not a personal Microsoft Copilot chat setup. |
| Copilot Studio | [Add an existing MCP server to an agent](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent). The agent's tool onboarding configures OAuth; Streamable HTTP is required and organization data policies apply. |
| Cursor | [MCP setup and authentication](https://cursor.com/docs/mcp). The project or user configuration, OAuth and enterprise MCP policy determine whether the tools are available. |

Tutorials are textual and contain no invented product screenshots. The existing
assistant marks are reused. The new
[Microsoft 365 mark](../apps/web/public/brands/microsoft365.svg) is the unchanged
SVG served by Microsoft Adoption and labelled there as the Microsoft 365
Copilot logo; its original URL and hash are recorded in
[asset provenance](../assets/brand/source/microsoft365-copilot-provenance.json).
Its presence identifies the product and does not imply an endorsement or a
qualified integration.

## Validation

These are local candidate results. The browser runs overlap and must not be
added together as a unique-test total.

After the MCP-first copy clarification, the preview build, typecheck and scoped
lint passed again. All 18 public assistant-guide checks passed on desktop and
iPhone, including the same guide component used in the dashboard; see the
[copy clarification report](../reports/assistant-mcp-copy-playwright.json) and
[updated captures](../reports/screenshots/assistant-mcp-copy/).
This follow-up changes guidance and labels only, with no backend change.

Release preparation caught a missed hash navigation between the initial render
and route subscription on iPhone. A deterministic regression failed on the
previous bundle, then passed after resynchronizing the route at subscription
without moving the initial scroll position. The postal review test now waits
for the rendered PDF before interacting with consent checkboxes. All nine
targeted checks (three scenarios across three browser profiles) passed; see
[the release-fix report](../reports/ci-iphone-fixes-playwright.json).

| Check | Result and evidence |
| --- | --- |
| Public browser suite | 56 passed, 4 intentionally skipped, no failures or flaky results. The skipped cases are iPhone/WebKit-specific checks omitted from the desktop project. [Report](../reports/assistant-hub-preview-playwright.json). |
| Final public regression | 32 passed, no skipped or flaky results, across desktop and iPhone projects. [Report](../reports/assistant-hub-preview-final-playwright.json). |
| Narrow navigation | 2 passed at 320 px, desktop and iPhone projects. [Report](../reports/assistant-hub-narrow-navigation-playwright.json). |
| Private assistant journey | 18 passed across three profiles (`chromium`, `mobile-chromium`, `iphone-webkit`), covering two browser engines. [Report](../reports/assistant-hub-private-playwright.json). |
| Typecheck, lint and builds | Passed for the local candidate. These establish code/build validity, not production deployment or real-host qualification. |
| Vitest | The initial full run covered 1,108 tests in 56 files: 1,100 passed and 8 failed in the postal-authority fixture because migration 0030 was missing from that fixture. After a one-line test setup correction, all 18 postal-authority tests passed, including the 8 failures. No product code changed after the full run. Together these runs cover the 1,108 tests; a fresh full `npm test` run is not claimed. [Initial JSON](../reports/assistant-hub-vitest-initial.json), [run log](../reports/assistant-hub-vitest.log). |
| Node security suite | 132 passed. [Run log](../reports/assistant-hub-security-tests.log). |
| Design review | The bounded Impeccable review concluded `SHIP` for this local candidate, with no material design reservation. This is a local design judgment, not release authorization. |

The tested behavior includes public guide access without a session, responsive
navigation, assistant selection, separate Copilot variants, clipboard success
and failure, return after authentication, reversible direct-send preference,
connection-list failure and refresh, and the separation of OAuth authorization
from observed successful exchanges. Test ownership is in the
[public suite](../tests/preview-e2e/assistant-hub.spec.ts) and
[private suite](../tests/e2e/assistant-hub.spec.ts). Representative visual proof
is kept in [the assistant-hub captures](../reports/screenshots/assistant-hub/),
including the public directory, guide pages, private workspace and Luxembourg
footer at desktop and mobile widths.

## Remaining boundaries

- No new external assistant account was connected or qualified during this
  work. Menus, OAuth behavior and account restrictions can change independently
  of the documented protocol support.
- A verified tool exchange is narrower than PDF attachment transfer, document
  fidelity, approval, provider acceptance or delivery. None is inferred from
  a logo, guide visit, copied prompt or historical connection observation.
- The guides are French. No complete multilingual guide parity is claimed.
- Prerendered routes and sitemap entries establish publication readiness;
  they do not establish production publication, crawling or indexing.
- Production release remains a separate authorized operation, including the
  ordered database migration and its checks before publishing the Worker.
  Provider activation, expert delegation, real sending and paid provisioning
  remain outside this candidate's UI changes.
