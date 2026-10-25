import { msg, msgIn } from "./messages";
import { useEffect, type ReactNode } from "react";
import { PublicFooter, PublicHeader } from "./public-chrome";
import { PublicSupportFaq } from "./public-support-faq";
import "./legal-page.css";
import { getRoleGuide } from "./role-guide";

type InformationPageContent = {
  label: string;
  updated?: string | null;
  title: ReactNode;
  description: string;
  faq?: boolean;
  sections: { id: string; label: string; content: ReactNode }[];
};

const contact = <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>;

export function getInformationPages(): Record<string, InformationPageContent> {
  return {
    "/about/": {
      label: msg("About Guteneo"),
      title: msg("About Guteneo"),
      updated: null,
      description: msg(
        "Guteneo is an independent service published by Nicolas Pieper to prepare, authorise and track document dispatches from its workshop or a connected assistant.",
      ),
      sections: [
        {
          id: "service",
          label: msg("The service"),
          content: (
            <>
              <h2>{msg("The service and its beta")}</h2>
              <p>
                {msg(
                  "Guteneo is currently offered in beta. The business is not yet registered and no sales are open on the website.",
                )}
              </p>
              <p>
                <a href="/terms/">{msg("Terms")}</a>
                {" · "}
                <a href="/assistants/">{msg("Assistants")}</a>
                {" · "}
                <a href="/developers/">{msg("Developers")}</a>
              </p>
            </>
          ),
        },
        {
          id: "publisher",
          label: msg("Publisher"),
          content: (
            <>
              <h2>{msg("Publisher")}</h2>
              <p>
                {msg(
                  "The Guteneo website is published by Nicolas Pieper, who is also responsible for its publication.",
                )}
              </p>
              <p>
                <a href="https://nicolaspieper.com">Nicolas Pieper</a>
                {" · "}
                <a href="/legal/">{msg("Legal notice")}</a>
              </p>
              <p>{contact}</p>
              <nav aria-label={msg("Nicolas Pieper’s profiles")}>
                <a href="https://www.linkedin.com/in/nicolaspieper">LinkedIn</a>
                {" · "}
                <a href="https://github.com/nclsppr">GitHub</a>
                {" · "}
                <a href="https://twitter.com/NicolasPieper">X (Twitter)</a>
              </nav>
            </>
          ),
        },
      ],
    },
    "/roles/": getRoleGuide(),
    "/privacy/": {
      label: msg("Privacy"),
      updated: msg("Updated on 23 October 2026"),
      title: (
        <>
          {msg("Your data, ")}
          <em>{msg("your rights.")}</em>
        </>
      ),
      description: msg(
        "The data Guteneo uses, who receives it, how long it is kept and how to exercise your rights.",
      ),
      sections: [
        {
          id: "controller",
          label: msg("Who responds to you"),
          content: (
            <>
              <h2>{msg("Who responds to you")}</h2>
              <p>
                {msg(
                  "Nicolas Pieper is the controller for the processing necessary to operate Guteneo: accounts, access, dispatch preparation and tracking, security and support. You can contact him at",
                )}{" "}
                {contact}
                {msg(
                  ", or by post at 59 rue du général de Gaulle, 57330 Hettange-Grande, France.",
                )}
              </p>
              <p>
                {msg(
                  "This policy covers the Guteneo website and service, including its assistant connections. If an organisation gives you access to its account or includes your contact details in a document, it remains responsible for the purposes of that use. It is your first point of contact for the content it entrusts to the service; we can help you identify the relevant request.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "data",
          label: msg("The data used"),
          content: (
            <>
              <h2>{msg("The data used")}</h2>
              <ul>
                <li>
                  <strong>{msg("Account and connections:")}</strong>{" "}
                  {msg(
                    " identity and email address, account membership, role, assistant connections, permissions, sessions and any delegation mandates.",
                  )}
                </li>
                <li>
                  <strong>{msg("Documents:")}</strong>{" "}
                  {msg(
                    " PDFs sent or imported at your request, name, size, page count, file fingerprint and check results. Content supplied to create a PDF, its renderings and requested page images may also be processed.",
                  )}
                </li>
                <li>
                  <strong>{msg("Dispatches:")}</strong>{" "}
                  {msg(
                    " sender, recipient, channel, options, quote, spending limit, approval or delegation used, status, events and provider reference.",
                  )}
                </li>
                <li>
                  <strong>{msg("Operation:")}</strong>{" "}
                  {msg(
                    " credit and reservations, usage, access and security logs, technical connection data and support exchanges.",
                  )}
                </li>
              </ul>
              <p>
                {msg(
                  "The workspace can also process CSV, XLSX, XML, JSON or Word sources you provide, their profiles and sample data, templates, field mappings, generation data and distribution manifests. When PDF/UA or PDF/A diagnostics are available, their reports are linked to the exact document and its fingerprint. This information supports the creation, checks and retrieval you request; it may be returned to your assistant according to its permissions.",
                )}
              </p>
              <p>
                {msg(
                  "This data comes from you, authorised account members, the assistant you connect or the provider returning a status. Guteneo receives the parameters and files sent to its tools; connecting an assistant does not give it access to your entire conversation. Information returned to that assistant nevertheless becomes accessible to that service under its own rules.",
                )}
              </p>
              <p>
                {msg(
                  "Account data required for authentication and information required for dispatch are essential to those functions. Without them, sign-in or dispatch cannot be completed. Provide only necessary data and ensure you are entitled to use third-party documents and contact details.",
                )}
              </p>
              <p>
                {msg(
                  "In ChatGPT and Codex workflows, do not transmit payment-card data covered by PCI DSS, protected health information, government identifiers, authentication secrets or sensitive personal data. This restriction covers documents, messages, templates and datasets, including those already stored. Antivirus checks do not filter these categories.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "purposes",
          label: msg("Why and on what basis"),
          content: (
            <>
              <h2>{msg("Why and on what basis")}</h2>
              <p>
                {msg(
                  "Account creation and the functions you request are based on performance of the service: importing a document, checking it, producing a quote, obtaining authorisation, transmitting the dispatch and providing its tracking.",
                )}
              </p>
              <p>
                {msg(
                  "Preventing abuse, protecting access, diagnosing incidents and keeping evidence needed for a dispute are based on the legitimate interest in operating a safe service and defending the rights of those concerned. For recipient contact details supplied by a user, this interest includes delivering their authorised correspondence. You may object to this processing under the conditions provided by applicable regulations.",
                )}
              </p>
              <p>
                {msg(
                  "Requests to exercise rights and applicable legal obligations are handled to comply with those obligations. A dispatch approval or technical mandate is not general consent to reuse your data for other purposes.",
                )}
              </p>
              <p>
                {msg(
                  "Document, permission, credit and destination checks may automatically block an operation. You can ask support for an explanation. Guteneo does not use these checks to build an advertising profile.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "recipients",
          label: msg("Who data is shared with"),
          content: (
            <>
              <h2>{msg("Who data is shared with")}</h2>
              <p>
                {msg(
                  "Authorised members of your account access information according to their permissions. The publisher may process information necessary for support, security and operation. Providers are involved only for the relevant functions:",
                )}
              </p>
              <ul>
                <li>
                  <strong>Cloudflare :</strong>{" "}
                  {msg(
                    " website and service hosting, database, file storage, technical processing and security.",
                  )}
                </li>
                <li>
                  <strong>Auth0 :</strong>{" "}
                  {msg(" authentication and sign-in management.")}
                </li>
                <li>
                  <strong>Telnyx :</strong>{" "}
                  {msg(
                    " document and information needed for a fax when that channel is available and the dispatch is authorised.",
                  )}
                </li>
                <li>
                  <strong>
                    {msg("Pingen and the relevant postal operators:")}
                  </strong>{" "}
                  {msg(
                    "preparation, printing and delivery of postal mail. A draft may be transferred to Pingen before the dispatch order; that transfer requires separate authorisation.",
                  )}
                </li>
                <li>
                  <strong>{msg("Optional workspace AI assistance:")}</strong>{" "}
                  {msg(
                    " if an administrator has enabled it and authorized this transfer, OpenAI may receive bounded excerpts of the data or template, their structure and your instruction to produce the requested proposal. The request uses store:false; this does not mean the provider retains no data. This assistance is separate from your connected assistant and does not initiate any delivery.",
                  )}
                </li>
                <li>
                  <strong>
                    {msg("Your connected assistant, such as ChatGPT:")}
                  </strong>{" "}
                  {msg(
                    "tool results, metadata, requested document content or pages, according to the permissions granted.",
                  )}
                </li>
              </ul>
              <p>
                {msg(
                  "The final recipient naturally receives the authorised correspondence. Sending emails through Guteneo and purchasing credit are not available in this version of the beta.",
                )}
              </p>
              <p>
                {msg(
                  "Guteneo’s databases and document storage use Cloudflare’s European jurisdiction options. This does not guarantee that all processing by Cloudflare, Auth0, dispatch providers or the assistant remains within the European Union. Their involvement may include other countries, particularly the United States. To learn about the locations and transfer safeguards applicable to your use and obtain available information about those safeguards, contact ",
                )}
                {contact}
                {msg(". No claim of wholly European processing is made.")}
              </p>
            </>
          ),
        },
        {
          id: "retention",
          label: msg("How long data is kept"),
          content: (
            <>
              <h2>{msg("How long data is kept")}</h2>
              <p>
                <strong>{msg("PDFs stored by Guteneo:")}</strong>{" "}
                {msg(
                  " automatic deletion becomes possible 90 days after creation. It takes place during a maintenance run, when no associated dispatch is ongoing or still unresolved. An open dispatch can therefore extend retention. This mechanism does not guarantee deletion to the exact minute or day; keep your own original.",
                )}
              </p>
              <p>
                {msg(
                  "Deleting a file does not automatically delete all its metadata or dispatch history. References, statuses, approvals, credit movements and audit records are kept to manage operations, respond to requests and establish what happened in a dispute. Their necessity is reviewed when deletion or closure is requested: records no longer needed are deleted or anonymised; an applicable obligation, unresolved operation or dispute may justify retention limited to the relevant records and the time needed.",
                )}
              </p>
              <p>
                {msg(
                  "Data sources and their profiles become eligible for deletion after 30 days, unless a related generation job is still queued or running. Word originals become eligible for deletion after 30 days. Per-record data and intermediate generation artifacts become eligible after 90 days, once generation has stopped. Maintenance performs these deletions in batches; generated PDFs follow the PDF retention rules.",
                )}
              </p>
              <p>
                {msg(
                  "Templates, published versions, field mappings, manifests and diagnostic reports remain in the account history; deleting their source files does not automatically erase them. Their continued necessity is reviewed when you request erasure or account closure, according to the residual needs described above.",
                )}
              </p>
              <p>
                {msg(
                  "Account data is kept while the account is in use, then according to the same remaining needs after closure. Support requests are kept until resolved, then only if follow-up or a dispute requires it. Full self-service account deletion is not currently available: send your request to ",
                )}
                {contact}.
              </p>
              <p>
                {msg(
                  "Operational monitoring records successful connections, their date, the account and member concerned, the access type and the country estimated by Cloudflare when available. This register stores neither IP addresses nor detailed browser information. It is restricted to the publisher for security and service monitoring. Connection events and access records for this control panel are excluded from views after 90 days, then deleted during maintenance.",
                )}
              </p>
              <p>
                {msg(
                  "For each assistant connection, the date of its last successful tool use is kept with the connection to indicate whether it works. This tracking does not store the call’s content. You can revoke the connection in My account to prevent future access; requests to erase this history follow the rights procedure below.",
                )}
              </p>
              <p>
                {msg(
                  "Sessions and temporary authorisations have expiry dates; maintenance clears expired entries. Daily content-view counters are cleared after 31 days. A copy already sent to a recipient, assistant or provider is also subject to their own retention rules; deleting the file at Guteneo does not recall a dispatch.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          label: msg("Cookies and security"),
          content: (
            <>
              <h2>{msg("Cookies and security")}</h2>
              <p>
                {msg(
                  "Sign-in uses session cookies and cookies protecting the authentication flow. The browser may also remember your assistant connection preference. The app includes no advertising tracker. Authentication and security providers may process technical information needed for their functions.",
                )}
              </p>
              <p>
                {msg(
                  "Your language choice may be saved in this browser. If you save it in your profile, it is linked to your account for the website and iOS app.",
                )}
              </p>
              <p>
                {msg(
                  "Access to the service is controlled by the account, roles and permissions. Temporary document access expires and PDFs undergo the configured checks before use. These measures reduce risks without making every incident impossible. Do not send passwords, access tokens or secrets to support.",
                )}
              </p>
              <p>
                {msg(
                  "The public demo preview uses fictional data in the tab’s memory; it sends no postal mail. It is separate from the signed-in account and its persistent documents.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "rights",
          label: msg("Exercise your rights"),
          content: (
            <>
              <h2>{msg("Exercise your rights")}</h2>
              <p>
                {msg(
                  "You may request access, rectification, erasure or restriction of processing of your data, and portability where applicable. You may object to processing based on legitimate interest for reasons relating to your situation. These rights may be limited by other people’s rights, a legal obligation or the need to resolve an operation or dispute.",
                )}
              </p>
              <p>
                {msg("Write to ")}
                {contact}{" "}
                {msg(
                  " with your request and the account concerned. Additional identity information will be requested only if there is reasonable doubt, in a proportionate manner. A response is provided within one month; for complex or numerous requests, an extension of up to two months may be needed and will be explained during the first month.",
                )}
              </p>
              <p>
                {msg("You can read the")}{" "}
                <a href="https://www.cnil.fr/fr/les-droits-pour-maitriser-vos-donnees-personnelles">
                  {msg("CNIL’s explanation of your rights")}
                </a>{" "}
                {msg("and")}{" "}
                <a href="https://www.cnil.fr/fr/adresser-une-plainte">
                  {msg("lodge a complaint with the CNIL")}
                </a>
                {msg(
                  ". This policy will be updated if the service or its processing changes.",
                )}
              </p>
            </>
          ),
        },
      ],
    },
    "/terms/": {
      label: msg("Terms of use"),
      updated: msg("Updated on 23 October 2026"),
      title: (
        <>
          {msg("A framework ")}
          <em>{msg("for your dispatches.")}</em>
        </>
      ),
      description: msg(
        "Guteneo beta terms of use: access, documents, authorisations, trial credit and dispatch limits.",
      ),
      sections: [
        {
          id: "service",
          label: msg("The beta"),
          content: (
            <>
              <h2>{msg("The service and its beta")}</h2>
              <p>
                {msg(
                  "Guteneo is an independent service published by Nicolas Pieper to prepare, authorise and track document dispatches from its workshop or a connected assistant. His contact details appear in the ",
                )}
                <a href="/legal/">{msg("legal notice")}</a>
                {msg(". These terms describe the beta currently available.")}
              </p>
              <p>
                {msg(
                  "Fax and postal mail are available depending on account permissions, destinations, limits and configured providers. A visible feature does not guarantee that every destination is available. Email sending and credit purchases are disabled. Demonstrations and simulations use fictional results and provide no evidence of real transmission.",
                )}
              </p>
              <p>
                {msg(
                  "The beta may change, be interrupted for maintenance or be limited to handle an incident. No availability, support or delivery time is guaranteed. A material change to these terms will be indicated on this page and, when it affects account use, brought to your attention in the service or through an appropriate channel.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "account",
          label: msg("Your account"),
          content: (
            <>
              <h2>{msg("Your account and documents")}</h2>
              <p>
                {msg(
                  "Use accurate identity and contact details. Protect your access, grant only necessary permissions and report unauthorised access to ",
                )}
                {contact}
                {msg(
                  ". Administrators manage their account’s members and connections.",
                )}
              </p>
              <p>
                {msg(
                  "You must have the right to transmit the document and use the recipient’s contact details. Check the content, pages, sender, recipient and options before approval. Using Guteneo for unlawful content, fraud, harassment, impersonation, unauthorised dispatches or to bypass the service’s checks is prohibited.",
                )}
              </p>
              <p>
                {msg(
                  "ChatGPT and Codex workflows exclude sensitive personal data, protected health information, government identifiers, payment-card data covered by PCI DSS and authentication secrets. Do not transmit any document, message, template or dataset containing them, even if already stored.",
                )}
              </p>
              <p>
                {msg(
                  "Declaring a postal sender attests that you are authorised to use that identity and address; it is not physical verification of the address. Technical PDF checks certify neither the accuracy, lawfulness nor authenticity of its content.",
                )}
              </p>
              <p>
                {msg(
                  "Keep your originals and any records you need. Guteneo is not a permanent archiving service. Processing and retention rules are set out in the",
                )}{" "}
                <a href="/privacy/">{msg("privacy policy")}</a>.
              </p>
            </>
          ),
        },
        {
          id: "authorization",
          label: msg("Authorise a dispatch"),
          content: (
            <>
              <h2>{msg("Authorise a dispatch")}</h2>
              <p>
                {msg(
                  "Preparing a document or quote is not an instruction to send. Authorisation applies to the exact document, its recipient, options and the displayed cost or spending limit. Changes to these details or quote expiry may require new authorisation. Also check the quote’s tax and currency information.",
                )}
              </p>
              <p>
                {msg(
                  "By default, a person approves through the designated flow. An authenticated administrator can, in the browser, give an assistant a separate, limited and temporary mandate. Operations within its limits are recorded as delegated approval, not as a new human approval. The assistant cannot enable or extend this mandate itself. Your assistant’s confirmation requests and the service’s limits continue to apply.",
                )}
              </p>
              <p>
                {msg(
                  "Transferring a postal draft to the provider requires its own authorisation, even before printing or delivery. Connecting an assistant or giving it access to your documents does not by itself authorise it to send correspondence.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "credit",
          label: msg("Credit and costs"),
          content: (
            <>
              <h2>{msg("Credit and costs")}</h2>
              <p>
                {msg(
                  "The beta may grant trial credit under the conditions shown in your account. This credit is for eligible operations; it is not a deposit, a general means of payment or an amount redeemable for cash. This version offers no paid top-ups.",
                )}
              </p>
              <p>
                {msg(
                  "The applicable quote and spending limit are shown before authorisation. A credit reservation may be created at acceptance, then settled according to the operation’s outcome. A pending or uncertain status may delay settlement; contact support about any difference or reservation that seems abnormal.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "tracking",
          label: msg("Tracking and cancellation"),
          content: (
            <>
              <h2>{msg("Tracking, cancellation and limits")}</h2>
              <p>
                {msg(
                  "Acceptance by Guteneo, acceptance by a provider and delivery to the recipient are separate steps. Statuses depend on provider information and may arrive late. Handover of a letter to a postal operator does not by itself prove receipt by the recipient.",
                )}
              </p>
              <p>
                {msg(
                  "Cancellation is possible only while the dispatch status permits it. Correspondence already transmitted may no longer be recallable. If the outcome is unknown, do not send again: check tracking or contact support to avoid a duplicate.",
                )}
              </p>
              <p>
                {msg(
                  "The service does not guarantee that a fax or letter will be accepted for a particular procedure, received before a deadline, read, or have the value of registered mail or an electronic signature. Check the recipient’s requirements and choose a solution suited to your procedure’s deadlines or formalities.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "support",
          label: msg("Support and closure"),
          content: (
            <>
              <h2>{msg("Support, suspension and closure")}</h2>
              <p>
                {msg("For an incident, dispute or closure request, write to ")}
                {contact}
                {msg(". The page ")}
                <a href="/support/">{msg("support page")}</a>{" "}
                {msg(
                  "sets out the useful information. Data still needed to resolve an operation or dispute follows the retention rules explained in the privacy policy.",
                )}
              </p>
              <p>
                {msg(
                  "Access or an operation may be suspended in the event of a security risk, abuse, unlawful use or breach of these terms. Where possible without compromising security or an applicable obligation, the reason is explained and you may challenge it through support.",
                )}
              </p>
              <p>
                {msg(
                  "These terms do not remove any mandatory legal rights you have or exclude liability that cannot legally be excluded. If you encounter a problem, please contact us so we can seek a solution.",
                )}
              </p>
            </>
          ),
        },
      ],
    },
    "/support/": {
      faq: true,
      label: msg("Support"),
      title: (
        <>
          {msg("Need ")}
          <em>{msg("a helping hand?")}</em>
        </>
      ),
      description: msg(
        "Contact Guteneo support about a document, dispatch, connection or data-related request.",
      ),
      sections: [
        {
          id: "contact",
          label: msg("Write to us"),
          content: (
            <>
              <h2>{msg("Write to us")}</h2>
              <p>
                {msg("For a question, incident or account request, write to ")}
                <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>
                {msg(". Your contact is Nicolas Pieper, Guteneo’s publisher.")}
              </p>
              <p>
                {msg(
                  "Include the relevant account address, document or dispatch reference, approximate date, action attempted and error message. A screenshot with personal data hidden may help. Do not attach the original PDF, the recipient’s full contact details or other sensitive data to the first message unless necessary. Never send a password, sign-in code or access token.",
                )}
              </p>
              <p>
                {msg(
                  "The beta offers no emergency support or guaranteed response time for technical requests. If your procedure has a strict deadline, arrange another suitable method.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "document",
          label: msg("A rejected PDF"),
          content: (
            <>
              <h2>{msg("A rejected or unavailable PDF")}</h2>
              <p>
                {msg(
                  "Check that the file is a readable PDF and that its size and page count meet the limits stated by the service. For a link import, the document must be accessible at an authorised public HTTPS address; a link to a local file or one requiring sign-in is not suitable.",
                )}
              </p>
              <p>
                {msg(
                  "Wait for the checks to finish before preparing the dispatch. If a document is blocked or no longer retained, its tracking may remain visible even though the file is unavailable. Always keep your original and report the error code to support if the block persists.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "dispatch",
          label: msg("A pending dispatch"),
          content: (
            <>
              <h2>{msg("A pending dispatch or reserved credit")}</h2>
              <p>
                {msg(
                  "First check the dispatch details in your account or ask your assistant to track it. A quote or draft is not a dispatch; acceptance is not yet delivery to the recipient.",
                )}
              </p>
              <p>
                {msg(
                  "If the outcome is unknown, do not retry. Send the reference to support to avoid duplicates. Also include that reference if a credit reservation remains open or the amount differs from the approved quote. Paid purchases and top-ups are not available.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "connection",
          label: msg("Assistant and permissions"),
          content: (
            <>
              <h2>{msg("Assistant and permissions")}</h2>
              <p>
                {msg("The ")}
                <a href="/assistants/">{msg("connection guides")}</a>{" "}
                {msg(
                  " show the steps for each assistant. Check the Guteneo account used and the permissions granted. A successful connection does not automatically make every channel or destination available.",
                )}
              </p>
              <p>
                {msg(
                  "An administrator can review connections and mandates in account settings. Revoke any connection or delegation no longer needed. If you suspect unauthorised access, explicitly tell support and also secure your identity provider account.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "data",
          label: msg("Your data and rights"),
          content: (
            <>
              <h2>{msg("Your data and rights")}</h2>
              <p>
                {msg(
                  "To view, correct or delete your data, request account closure or report a privacy incident, write to ",
                )}
                {contact}
                {msg(
                  ". Specify your request; an identity document is not requested as a matter of course.",
                )}
              </p>
              <p>
                {msgIn("singular-article", "The")}{" "}
                <a href="/privacy/#rights">{msg("privacy policy")}</a>{" "}
                {msg(
                  "explains the rights, applicable response times and document retention. The",
                )}{" "}
                <a href="/terms/">{msg("terms of use")}</a>{" "}
                {msg(
                  " describe authorisations, trial credit and service limits.",
                )}
              </p>
            </>
          ),
        },
      ],
    },
  };
}

export function InformationPage({
  content,
}: {
  content: InformationPageContent;
}) {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id || id.startsWith("/")) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [content.label]);
  return (
    <div className="legal-page public-site">
      <a className="skip-link" href="#information-content">
        {msg("Skip to content")}
      </a>
      <PublicHeader />
      <main id="information-content" className="legal-document" tabIndex={-1}>
        <div className="legal-intro">
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          {content.updated !== null && (
            <p className="legal-date">
              {content.updated ?? msg("Updated on 22 September 2026")}
            </p>
          )}
        </div>
        <div className="legal-layout">
          <nav aria-label={msg("On this page")} className="legal-index">
            {content.sections.map((section) => (
              <a href={`#${section.id}`} key={section.id}>
                {section.label}
              </a>
            ))}
          </nav>
          <div className="legal-copy">
            {content.sections.map((section) => (
              <section id={section.id} tabIndex={-1} key={section.id}>
                {section.content}
              </section>
            ))}
          </div>
        </div>
        {content.faq && <PublicSupportFaq />}
      </main>
      <PublicFooter />
    </div>
  );
}
