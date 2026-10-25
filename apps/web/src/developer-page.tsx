import { msg } from "./messages";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Code, FilePdf } from "@phosphor-icons/react";
import { PublicHeader, PublicFooter } from "./public-chrome";
import "./developer.css";

const uploadExample = `curl 'https://guteneo.com/api/documents' \\\n  --header "Authorization: Bearer $GUTENEO_ACCESS_TOKEN" \\\n  --form 'file=@./document.pdf;type=application/pdf'`;
const prepareExample = `curl 'https://guteneo.com/api/dispatches' \\\n  --header "Authorization: Bearer $GUTENEO_ACCESS_TOKEN" \\\n  --header 'Content-Type: application/json' \\\n  --header 'Idempotency-Key: unique-preparation-001' \\\n  --data '{
    "channel": "fax",
    "documentId": "doc_received_identifier",
    "recipient": { "phone": "+33199001234" }
  }'`;
const readExample = `curl 'https://guteneo.com/api/dispatches/dsp_received_identifier' \\\n  --header "Authorization: Bearer $GUTENEO_ACCESS_TOKEN"`;

function CodeExample({ title, children }: { title: string; children: string }) {
  return (
    <figure className="developer-code">
      <figcaption>{title}</figcaption>
      <pre tabIndex={0} aria-label={title}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

export function DeveloperPage() {
  const scopes = [
    ["documents:read", msg("List PDFs and read their validated bytes.")],
    ["documents:write", msg("Upload, generate and recheck a document.")],
    [
      "dispatches:prepare",
      msg("Prepare a dispatch, create a campaign, validate a CSV."),
    ],
    [
      "dispatches:send",
      msg("Confirm after human approval or cancel before submission."),
    ],
    ["dispatches:read", msg("Read dispatches, campaigns, senders and usage.")],
  ];
  const [reference, setReference] = useState<
    "closed" | "loading" | "open" | "error"
  >("closed");
  const explorer = useRef<HTMLDivElement>(null);
  async function openReference() {
    if (reference === "loading" || reference === "open") return;
    setReference("loading");
    try {
      const { mountSwagger } = await import("./swagger-loader");
      if (!explorer.current) return;
      await mountSwagger(explorer.current);
      setReference("open");
    } catch {
      setReference("error");
    }
  }
  return (
    <div className="landing public-site developer-page">
      <a className="skip-link" href="#developer-main">
        {msg("Skip to documentation")}
      </a>
      <PublicHeader activePage="developers" />
      <main id="developer-main" tabIndex={-1}>
        <div className="developer-intro">
          <h1>
            {msg("Your documents.")}
            <br />
            <em>{msg("Your way to send them.")}</em>
          </h1>
          <p className="developer-dek">
            {msg(
              "Connect your app to Guteneo: a PDF faithful to the original, a preparation you can check and the final say left to the person sending it.",
            )}
          </p>
          <div className="developer-intro-links">
            <a className="button" href="#getting-started">
              {msg("Read the guide ")}
              <ArrowDown size={17} aria-hidden="true" />
            </a>
            <a href="/openapi.json" download="guteneo-openapi.json">
              {msg("Download the OpenAPI contract")}{" "}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
          <p className="developer-beta">
            <strong>{msg("Beta in preparation.")}</strong>{" "}
            {msg(
              " This reference describes the available code. Guteneo hosts the beta; check the service capabilities for enabled channels. The separate demo uses fictional data. The €50 welcome credit does not replace transport activation; no top-ups are offered.",
            )}
          </p>
          <dl className="developer-facts">
            <div>
              <dt>{msg("Contract")}</dt>
              <dd>REST · OpenAPI 3.0.3</dd>
            </div>
            <div>
              <dt>{msg("Access")}</dt>
              <dd>OAuth 2.0 · PKCE</dd>
            </div>
            <div>
              <dt>{msg("Documents")}</dt>
              <dd>{msg("Private PDFs · SHA-256")}</dd>
            </div>
          </dl>
        </div>
        <div className="developer-layout">
          <nav
            className="developer-contents"
            aria-label={msg("Documentation contents")}
          >
            <span>{msg("In this guide")}</span>
            <a href="#getting-started">{msg("01 — Prepare a dispatch")}</a>
            <a href="#authentication">{msg("02 — Sign in")}</a>
            <a href="#documents">{msg("03 — Keep the original")}</a>
            <a href="#reliability">{msg("04 — Track without duplicating")}</a>
            <a href="#limits">{msg("05 — Limits and errors")}</a>
            <a href="#reference">{msg("06 — API reference")}</a>
          </nav>
          <div className="developer-copy">
            <section id="getting-started">
              <h2>{msg("Prepare. Review. Confirm.")}</h2>
              <p>
                {msg(
                  "Uploading and preparation do not trigger any communication. Once the beta is open, first create your Guteneo workspace in the browser and verify your email address. Then connect a registered OAuth client with the required permissions.",
                )}
              </p>
              <ol className="developer-steps">
                <li>
                  <strong>{msg("Upload the PDF.")}</strong>{" "}
                  {msg(" Send the original file in the field ")}
                  <code>file</code>
                  {msg(". Wait for its status to become")} <code>ready</code>{" "}
                  {msg(
                    " : a 201 response may still refer to a quarantined document.",
                  )}
                </li>
                <li>
                  <strong>{msg("Prepare the dispatch.")}</strong>{" "}
                  {msg(
                    " Choose the document and recipient. Keep the response, its ",
                  )}
                  <code>id</code>
                  {msg(
                    ", its fingerprint and the returned amounts. Any spending limit you set is in EUR cents.",
                  )}
                </li>
                <li>
                  <strong>{msg("Standard approval.")}</strong>{" "}
                  {msg(" Direct the person to")}{" "}
                  <code>https://guteneo.com/#/app/dispatch/&#123;id&#125;</code>
                  {msg(
                    ". They review the PDF, recipient, options and cost, then approve in their Guteneo session. Optional expert mode follows a limited mandate enabled beforehand in My account for the relevant assistant.",
                  )}
                </li>
                <li>
                  <strong>{msg("Confirm and track.")}</strong>{" "}
                  {msg(" The client can then call")}{" "}
                  <code>POST /api/dispatches/&#123;id&#125;/confirm</code>
                  {msg(
                    ", with an idempotency key specific to this confirmation. Then read the dispatch status again.",
                  )}
                </li>
              </ol>
              <CodeExample title={msg("1. Upload the original file")}>
                {uploadExample}
              </CodeExample>
              <CodeExample
                title={msg(
                  "2. Prepare a fax — replace the fictional identifiers and number",
                )}
              >
                {prepareExample}
              </CodeExample>
              <p className="developer-note">
                {msg(
                  "These examples are request templates, not provided credentials. The environment variable contains an access token obtained by your OAuth client; never put it in a URL or code repository. No example is executed from this page.",
                )}
              </p>
              <p>
                {msg("The REST result is the raw dispatch. The field")}{" "}
                <code>approvalUrl</code>{" "}
                {msg(
                  " belongs to the MCP response; in REST, build the browser link using the returned identifier. A yes in a conversation and tool permission create neither human approval nor an expert mandate. The expert MCP flow uses a recent review followed by delegated approval; it respects the mandate’s limits and your assistant’s confirmations.",
                )}
              </p>
              <p>
                {msg("For postal mail, first read the template with")}{" "}
                <code>GET /api/postal/requirements?country=LU</code>
                {msg(
                  ", specifying the recipient’s country. After creating and importing the PDF, use ",
                )}
                <code>POST /api/postal/preflights</code>{" "}
                {msg(" : Guteneo checks the exact PDF and returns a")}{" "}
                <code>reviewUrl</code>
                {msg(
                  ". In standard mode, the person opens this link to review the pages and authorise transfer to the printing provider. Expert mode requires a postal mandate that separately covers this data transfer; it does not trigger any dispatch. After the draft has been analysed, request",
                )}
                <code> POST /api/postal/preflights/&#123;id&#125;/quote</code>
                {msg(
                  ", then have the quote approved. These steps remain separate from sending; an uncertain transfer must never be retried automatically.",
                )}
              </p>
            </section>
            <section id="authentication">
              <h2>{msg("Precise permissions.")}</h2>
              <p>
                {msg(
                  "For the website and iOS app, start sign-in from Guteneo. The identity form uses",
                )}{" "}
                <code>auth.guteneo.com</code>
                {msg(
                  ". The OAuth addresses below are for API and MCP clients; their canonical domain stays unchanged for existing connections.",
                )}
              </p>
              <p>
                {msg("Clients use Authorization Code with PKCE")}{" "}
                <code>S256</code>
                {msg(
                  ", an exactly registered redirect URI and a verified parameter ",
                )}
                <code>state</code> {msg(" . The audience is")}{" "}
                <code>https://guteneo.com/mcp</code>
                {msg(
                  ", including for the documented REST routes. There is no personal API key or password to share with an assistant.",
                )}
              </p>
              <dl className="developer-endpoints">
                <dt>{msg("API / MCP authorisation")}</dt>
                <dd>
                  <code>https://pieper.eu.auth0.com/authorize</code>
                </dd>
                <dt>{msg("API / MCP code exchange")}</dt>
                <dd>
                  <code>https://pieper.eu.auth0.com/oauth/token</code>
                </dd>
                <dt>{msg("HTTP token")}</dt>
                <dd>
                  <code>Authorization: Bearer &lt;access_token&gt;</code>
                </dd>
              </dl>
              <p>
                {msg(
                  "Use an access token, never an ID token. A public client contains no client secret. The organisation is determined by membership and the authorised connection; no parameter allows freely selecting another workspace. With multiple workspaces, the link is set in the dashboard’s connections. The reader role forbids writes, even with a scope. During the beta, all roles require a verified account; two-factor authentication is not mandatory.",
                )}
              </p>
              <div
                className="developer-table-scroll"
                tabIndex={0}
                aria-label={msg("OAuth permissions")}
              >
                <table>
                  <caption>
                    {msg("Request only the permissions you need.")}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Scope</th>
                      <th scope="col">{msg("Permission")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopes.map(([scope, description]) => (
                      <tr key={scope}>
                        <th scope="row">
                          <code>{scope}</code>
                        </th>
                        <td>{description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                <strong>{msg("No scope authorises human approval.")}</strong>{" "}
                {msg(
                  "The browser approval route, administration and billing are not part of this developer API. OAuth permissions do not replace role, sender, credit or channel checks.",
                )}
              </p>
              <p>
                {msg(
                  "For assistants, the intended transport is MCP Streamable HTTP at ",
                )}
                <code>https://guteneo.com/mcp</code>
                {msg(". Integration files are available in")}{" "}
                <a href="/#installation">
                  {msg("the installation instructions")}
                </a>
                {msg(
                  ". Each client still needs to be registered and tested in its real environment.",
                )}
              </p>
            </section>
            <section id="documents">
              <h2>{msg("An original stays an original.")}</h2>
              <p>
                <code>POST /api/documents</code>{" "}
                {msg(
                  " preserves the uploaded bytes. The PDF is private, identified by its SHA-256, and undergoes scanning and validation in an isolated environment.",
                )}{" "}
                <code>GET /api/documents/&#123;id&#125;/content</code>{" "}
                {msg(" returns only a ready document, with the header")}{" "}
                <code>X-Document-SHA256</code> {msg(" and no public caching.")}
              </p>
              <p>
                <code>POST /api/documents/render</code>{" "}
                {msg(
                  " creates a new A4 PDF from sanitised HTML. Scripts, supplied styles and external resources are removed. This rendering must not be used to reconstruct an original from its text. URL import is restricted to the MCP tool ",
                )}
                <code>import_document</code>
                {msg(
                  ", on any public HTTPS domain, without redirects; it is not a REST route.",
                )}
              </p>
              <p>
                {msg("The field ")}
                <code>analysis</code>{" "}
                {msg(
                  " shows whether the check is in progress, complete, needs a retry or is blocked, with an explanation and a next action. While a check is in progress, query ",
                )}
                <code>GET /api/documents/&#123;id&#125;</code>{" "}
                {msg(
                  " no more often than every 15 seconds. The server handles limited automatic retries. Offer an explicit retry via",
                )}{" "}
                <code>POST /api/documents/&#123;id&#125;/rescan</code>{" "}
                {msg(" only when the returned action is ")}
                <code>rescan</code>
                {msg(". Keep the same document: no new upload is needed.")}
              </p>
            </section>
            <section id="reliability">
              <h2>{msg("One request, one dispatch.")}</h2>
              <p>
                {msg("The header ")}
                <code>Idempotency-Key</code>{" "}
                {msg(
                  " is required for preparation and confirmation: 1 to 200 characters, with no newline or NUL character. Keep a stable key for each logical operation; use a different key for confirmation. Reusing a key with different content produces",
                )}{" "}
                <code>IDEMPOTENCY_CONFLICT</code>.
              </p>
              <p>
                {msg("The fingerprint ")}
                <code>fingerprint</code>{" "}
                {msg(
                  " binds the approved content, recipient, document, options and cost. Approval lasts at most 15 minutes and may expire earlier with the quote. Confirmation reserves the spending limit and inserts the work to be done in the same transaction.",
                )}
              </p>
              <CodeExample
                title={msg("Read the status before deciding on another action")}
              >
                {readExample}
              </CodeExample>
              <ul className="developer-states">
                <li>
                  <code>prepared</code>{" "}
                  {msg(" : preparation saved, not yet queued.")}
                </li>
                <li>
                  <code>queued</code>{" "}
                  {msg(" : confirmation accepted, work pending.")}
                </li>
                <li>
                  <code>submitting</code> / <code>submission_unknown</code>{" "}
                  {msg(
                    " : the provider may already have received the request. No automatic retry or new replacement dispatch.",
                  )}
                </li>
                <li>
                  <code>accepted</code>{" "}
                  {msg(
                    " : accepted by the provider; this is not proof of delivery. Check the subsequent events.",
                  )}
                </li>
              </ul>
              <p>
                {msg(
                  "After an HTTP timeout, first read the dispatch again. Cancellation is possible only before submission starts, for ",
                )}
                <code>prepared</code> {msg(" or ")}
                <code>queued</code>. <code>CANCELLATION_TOO_LATE</code>{" "}
                {msg(" means cancellation is no longer guaranteed.")}
              </p>
              <p>
                {msg("Responses always distinguish between ")}
                <code>mode: simulation</code> {msg("and ")}
                <code>production</code>
                {msg(
                  ". Balances and spending limits are integers in EUR cents. A fractional quote also exposes",
                )}
                <code> quote_customer_nanoeur</code>{" "}
                {msg(
                  " : 1 EUR equals one billion nanoEUR. Charges in cents follow the organisation’s exact cumulative total, without rounding each email up to one cent. These fields may be absent from lists or null; this does not mean a zero price.",
                )}
              </p>
              <p>
                {msg("For fax v3, ")}
                <code>faxPricing</code>{" "}
                {msg(
                  " provides the price range excluding tax in nanoEUR and the firm spending limit in cents. The limit is reserved at confirmation. Then check",
                )}
                <code> settlement.status</code>{" "}
                {msg(" : delivery may be complete while settlement is still ")}
                <code>reserved</code>
                {msg(". Only ")}
                <code>settled</code>{" "}
                {msg(
                  " provides validated usage and the balance debit. The qualified rate limits faxes to a maximum of ten pages, even if the PDF was successfully imported.",
                )}
              </p>
              <p>
                {msg(
                  "In production, each channel requires qualified private pricing and a quote that is still valid. No provider amount supplied by the client can replace them. The indicative homepage rates are not an API quote.",
                )}
              </p>
            </section>
            <section id="limits">
              <h2>{msg("Plan for waiting states.")}</h2>
              <dl className="developer-limits">
                <div>
                  <dt>PDF</dt>
                  <dd>{msg("10 MiB · 100 pages maximum")}</dd>
                </div>
                <div>
                  <dt>{msg("Email HTML and text")}</dt>
                  <dd>{msg("128 KiB UTF-8 per content")}</dd>
                </div>
                <div>
                  <dt>CSV</dt>
                  <dd>{msg("256 KiB · 500 rows maximum")}</dd>
                </div>
                <div>
                  <dt>{msg("Lists")}</dt>
                  <dd>{msg("30 items by default · 100 maximum")}</dd>
                </div>
                <div>
                  <dt>{msg("Authenticated API")}</dt>
                  <dd>{msg("180 requests per minute per organisation")}</dd>
                </div>
                <div>
                  <dt>{msg("PDF rechecks")}</dt>
                  <dd>{msg("10 per day per organisation")}</dd>
                </div>
              </dl>
              <p>
                {msg(
                  "Uploads and renders also have daily quotas specific to the organisation. Lists return ",
                )}
                <code>items</code> {msg(" and")} <code>nextCursor</code>{" "}
                {msg(
                  " ; send this opaque cursor back unchanged. CSV validation responses separate",
                )}{" "}
                <code>rows</code>, <code>errors</code> {msg(" and")}{" "}
                <code>duplicates</code>{" "}
                {msg(" : HTTP success does not mean every row is valid.")}
              </p>
              <p>
                {msg("An error contains")}{" "}
                <code>
                  &#123; "error": &#123; "code", "message" &#125; &#125;
                </code>
                {msg(", sometimes a list ")}
                <code>fields</code>
                {msg(". Keep the code and")} <code>X-Correlation-ID</code>{" "}
                {msg(
                  " for diagnostics, without logging the document, recipient or token.",
                )}
              </p>
              <ul>
                <li>
                  <strong>401 / 403 :</strong>{" "}
                  {msg(" authentication or permission;")}{" "}
                  <code>ONBOARDING_REQUIRED</code>{" "}
                  {msg(" requires signing in through the browser first.")}
                </li>
                <li>
                  <strong>409 :</strong>{" "}
                  {msg(
                    " incompatible approval, quote, credit, quota or status. Correct the cause; do not change the key to force a dispatch.",
                  )}
                </li>
                <li>
                  <strong>413 / 423 :</strong>{" "}
                  {msg(" content too large or document cannot be viewed.")}
                </li>
                <li>
                  <strong>429 :</strong>{" "}
                  {msg(" slow down. The HTTP limit returns")}{" "}
                  <code>Retry-After: 60</code>{" "}
                  {msg(
                    " ; document quotas do not necessarily include this header.",
                  )}
                </li>
                <li>
                  <strong>503 :</strong>{" "}
                  {msg(
                    " required configuration or service unavailable. The public demo instead returns",
                  )}{" "}
                  <code>403 PREVIEW_ONLY</code>.
                </li>
              </ul>
              <p>
                <code>GET /api/usage</code>{" "}
                {msg(
                  " distinguishes welcome credit, reservations and monthly limits. The credit does not renew. An unknown provider outcome keeps the reservation; it never justifies an automatic resend.",
                )}
              </p>
            </section>
          </div>
        </div>
        <section
          className="developer-reference"
          id="reference"
          aria-labelledby="reference-title"
        >
          <div className="developer-reference-heading">
            <div>
              <h2 id="reference-title">
                {msg("Every route, every response.")}
              </h2>
            </div>
            <FilePdf size={38} weight="thin" aria-hidden="true" />
          </div>
          <p>
            {msg(
              "23 operations: documents, postal checks, dispatches, campaigns, recipients, senders, usage and service status. Explore the schemas in read-only mode. No execution button, no OAuth sign-in and no token sent from the explorer.",
            )}
          </p>
          <div className="developer-reference-actions">
            <button
              className="button"
              type="button"
              onClick={openReference}
              disabled={reference === "loading" || reference === "open"}
              aria-controls="swagger-reference"
              aria-expanded={reference === "open"}
            >
              <Code size={19} aria-hidden="true" />{" "}
              {reference === "loading"
                ? msg("Loading the reference…")
                : reference === "open"
                  ? msg("Reference open")
                  : msg("Open Swagger reference")}
            </button>
            <a href="/openapi.json" download="guteneo-openapi.json">
              {msg("Download OpenAPI (.json)")}{" "}
              <ArrowDown size={17} aria-hidden="true" />
            </a>
          </div>
          <noscript>
            <p>
              {msg(
                "The guide is available without JavaScript. To explore the schemas, download the OpenAPI contract above.",
              )}
            </p>
          </noscript>
          <p role="status" className="developer-reference-status">
            {reference === "error"
              ? msg(
                  "The reference could not be loaded. Try again or download the OpenAPI file.",
                )
              : reference === "open"
                ? msg("Reference loaded. You can expand the operations below.")
                : reference === "loading"
                  ? msg("Loading read-only schemas.")
                  : msg("The explorer loads only when you request it.")}
          </p>
          <div
            id="swagger-reference"
            ref={explorer}
            aria-busy={reference === "loading"}
          />
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
