# Public browser HTTP error pages

The website's public fetch boundary renders a branded document for eligible
browser errors. It preserves the actual HTTP status; it does not serve a success
page, redirect to the homepage or turn a missing resource into the application.
This is an implementation candidate until an authorized release and fresh
Safari/public-byte verification establish production behavior.

## Coverage and recovery

`apps/api/src/public-http-error.ts` supplies French, English, German and
Luxembourgish copy for 400, 401, 403, 404, 405, 408, 410, 413, 414, 415, 422,
429, 500, 501, 502, 503 and 504, with a generic 4xx/5xx fallback. The status must
actually arise at the public asset/fetch boundary. There is no user-selectable
error endpoint and no claim that every status is produced in normal operation.

Each document includes the error's meaning, a home/support recovery action, a
short description of Guteneo and links to the canonical website, assistant
guides, developer guide and independent status service. Links preserve a bounded
supported language. Copy does not promise an available delivery channel or a
successful transmission. There is no automatic retry or external submission.

## Protocol and privacy boundary

Only GET/HEAD requests explicitly accepting HTML and compatible document
navigation metadata can receive HTML. Asset/machine paths, Range/If-Range
requests, downloads with a nonempty Content-Disposition type other than inline
(including unknown types and text or untyped responses),
typed JSON/binary responses, 416 and Content-Range responses are excluded.
API, MCP, authentication, private review, native and Belvédère protocols retain
their own gates and responses. A missing known localized asset remains closed;
it is not replaced by a misleading public document.

The document contains checked-in copy and a validated language/status only. It
does not reflect the requested address, query, account, provider error or body.
Error responses retain no-store, noindex/nofollow, nosniff, CSP and the existing
security policy. Necessary Retry-After, Allow and WWW-Authenticate semantics stay
in headers without appearing in the page. HEAD has the same status/MIME and no
body. The component does not weaken authentication, approval or tenant isolation.

Cloudflare-generated outages/challenges that occur outside this Worker are a
separate provider surface. This change neither configures its paid Custom Errors
feature nor claims that a Worker can render while Cloudflare cannot execute it.

## Illustrations and accessibility

Three original decorative illustrations use Guteneo's blue engraving/paper
style: an atlas for navigation errors, an archive box for access errors and a
letterpress for temporary service errors. Official portrait, wordmark and swallow
assets remain unchanged. The image has empty alternative text; error meaning,
service description and every link remain accessible HTML. Failure to load an
illustration must not remove recovery navigation.

Masters and exact built-in Imagegen prompts are preserved in
`assets/editorial/source/error-{navigation,access,service}.{png,json}`.
`apps/web/public/errors/illustration-{navigation,access,service}.webp` and the
`-640.webp` variants are proportional WebP exports, with explicit square
dimensions and responsive selection. No text, customer data or credentials are
embedded in the bitmap.

## Evidence required

Unit and actual workerd tests qualify language/status negotiation, privacy,
protocol preservation and malformed/public/static-failure routing. Local browser
captures qualify loaded illustrations, native links, keyboard focus and desktop
and 320px layouts. Their fixtures do not qualify Safari in production. After an
authorized release, recheck an unknown address in actual Safari, its 404/HTML
response, new image bytes, public pages and unchanged private/API/MCP gates.
Do not manufacture a production outage or issue real communications to test a
decorative service-error view.
