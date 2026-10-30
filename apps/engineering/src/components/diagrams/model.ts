export type DiagramId = 'system' | 'dispatch' | 'documents' | 'freshness';

export interface DiagramStep {
  label: string;
  detail: string;
}

export interface DiagramModel {
  id: DiagramId;
  figure: string;
  title: string;
  asset: string;
  caption: string;
  hint?: string;
  steps: DiagramStep[];
}

export const diagrams: Record<DiagramId, DiagramModel> = {
  freshness: {
    id: 'freshness',
    figure: '04',
    title: 'The freshness governor',
    asset: 'provider-freshness',
    hint: 'Follow the reference · choose a step',
    caption: 'A calibration bench explains maintenance of a technical reference. The blue coupon is a reference, not a document or communication. Only information consumed by an active mechanism enters this process. The timer marks the last twenty-four hours before a real deadline; the stop preserves the operation’s safety gate. This is an explanatory model, not live telemetry.',
    steps: [
      { label: 'Select active inputs', detail: 'Select the exact provider, account, route or current policy generation actually used by the enabled operation. Informational dates, inactive configurations, revoked generations and the reviewer’s explicitly archived reference do not create freshness alerts.' },
      { label: 'Inspect real evidence', detail: 'Read the actual provider or official source within bounded requests. Recheck account, sender, currency and profile bindings. A successful GET alone does not turn old evidence into a new observation of the information used by the mechanism.' },
      { label: 'Commit a revision', detail: 'A successful renewal creates a new immutable revision under current guards. It preserves historical evidence and exact commitments. Work still bound to an earlier usable quote or uncertain provider outcome is not silently invalidated or resubmitted.' },
      { label: 'Warn at J−1', detail: 'If an active required deadline is at most twenty-four hours away without a valid replacement, record a durable incident and emit an operational alert. A new valid revision or proven deactivation resolves that binding; an unknown read or an omitted page does not.' },
      { label: 'Keep the safety stop', detail: 'At expiry, an unusable required reference still closes its affected operation. Technical renewal never extends a human mandate, creates an approval, enables a channel, reserves credit or submits a communication.' },
    ],
  },
  system: {
    id: 'system',
    figure: '01',
    title: 'A private core. An explicit handoff.',
    asset: 'system-architecture',
    caption: 'The two bases show a trust boundary. Workers, D1, private R2, queues and private validation form the Cloudflare side. Telnyx, Pingen and Resend are external providers. The machines are an explanatory metaphor; their movement is not live telemetry or a residency guarantee.',
    steps: [
      { label: 'Workers control', detail: 'The API and MCP surface call the shared domain service. Tenant context comes from authenticated membership; permissions and approval are checked on the server.' },
      { label: 'Private persistence', detail: 'D1 stores business records, approval, quota and the outbox. R2 stores private document bytes. Download access is scoped; the public website is not the document store.' },
      { label: 'Validate and queue', detail: 'Private document services inspect or transform documents. Accepted work is published from the outbox to a queue. Queue transport can repeat; an attempt claim protects provider submission.' },
      { label: 'External delivery', detail: 'Telnyx handles fax, Pingen handles printing and post, and Resend handles email. Provider callbacks and reconciliation update the domain record. Acceptance does not prove final delivery.' },
    ],
  },
  dispatch: {
    id: 'dispatch',
    figure: '02',
    title: 'The acceptance interlock',
    asset: 'dispatch-lifecycle',
    caption: 'The review clamp represents a separate immutable approval record. The coupled drawers represent one atomic acceptance transaction. The stopped rear tray represents submission_unknown: an uncertain provider outcome is reconciled, never automatically sent again. This is a synthetic walkthrough, not an approval or send control.',
    steps: [
      { label: 'Prepared', detail: 'A prepared dispatch binds a concrete recipient, document version, options and quote. Preparation alone does not authorize provider submission.' },
      { label: 'Approval record', detail: 'Approval captures immutable content, recipient, options and cost while the dispatch is still prepared. Human review and explicitly granted bounded expert delegation remain distinct records; an assistant cannot assert human consent.' },
      { label: 'Atomic acceptance', detail: 'The D1 acceptance transition verifies authority and approval, reserves quota and writes the outbox atomically. Either all of these commitments succeed together or none does.' },
      { label: 'Queued', detail: 'The outbox publisher feeds a queue. A conditional attempt claim moves the dispatch into submitting. Repeated queue messages do not authorize another provider attempt.' },
      { label: 'Provider outcome', detail: 'A known provider response may record accepted or failed. Later channel events describe delivery: fax delivered, postal printed or handed_to_post, and email delivered, bounced or complained. Provider acceptance is a distinct milestone.' },
      { label: 'Unknown: stop', detail: 'A timeout or expired submitting lease can leave submission_unknown. The service holds that attempt for provider-specific reconciliation. It does not automatically retry the communication.' },
    ],
  },
  documents: {
    id: 'documents',
    figure: '03',
    title: 'Keep the original. Derive the next version.',
    asset: 'document-pipeline',
    caption: 'The sealed archive and output tray are deliberately separate. Imported originals retain their exact bytes. Dataset mappings and versioned templates produce new derived documents with provenance. A generated PDF still needs its own applicable checks, review and dispatch authority.',
    steps: [
      { label: 'Private original', detail: 'An upload becomes a private original document. Its identity and exact stored bytes are preserved. Transformations create another document instead of silently rewriting it.' },
      { label: 'Data and mapping', detail: 'CSV, spreadsheets and structured data are parsed into sheets and rows. A mapping profile selects source fields and transformations. Preview and provenance make the mapping inspectable.' },
      { label: 'Template version', detail: 'Studio templates have explicit versions, fields and generation settings. Generation uses a concrete template version with concrete mapped data.' },
      { label: 'Generate', detail: 'A generation job renders document artifacts and records its manifest. The output derives from the selected inputs; generation does not itself authorize delivery.' },
      { label: 'Derived PDF', detail: 'A generated PDF or added postal address page has a separate derived identity and provenance. Source identities and provenance remain subject to the applicable access and retention rules.' },
      { label: 'Inspect and review', detail: 'Applicable scan, validation and preview checks apply before later approval and dispatch. A successful render is not proof that a provider, postal route or recipient has accepted the document.' },
    ],
  },
};

export const mermaidDiagrams: Record<DiagramId, {
  title: string;
  caption: string;
  width: number;
  text: string[];
}> = {
  freshness: {
    title: 'Active inputs, renewal and the final twenty-four hours',
    caption: 'The maintenance loop follows only data consumed by an active operation. Successful renewal and early operational warning support the existing expiry gate; they do not replace it.',
    width: 900,
    text: [
      'Start with the operation’s actual selected provider/account/route or current policy generation. Exclude inactive and informational references before evaluating deadlines.',
      'A bounded source read and exact binding validation can produce a new immutable technical revision. Preserve usable commitments and independent human authority; a failure leaves the earlier evidence unchanged.',
      'At deadline minus twenty-four hours, an active binding without a valid replacement opens a durable incident. Emit a distinct freshness signal to the existing operational alert channel. Resolve only from a current valid replacement or proven deactivation.',
      'At the real expiry, the affected operation continues to fail closed if its required data is invalid. Short-lived quotes, ordinary login expiry and intentionally bounded human mandates are not automatically renewed by this loop.',
    ],
  },
  system: {
    title: 'System and provider boundaries',
    caption: 'Workers orchestrate the shared domain service. Durable commitments, private bytes and queued work stay on the application side of an explicit handoff to external delivery providers.',
    width: 760,
    text: [
      'Clients reach Workers through the browser, native application, REST API or MCP. D1 records commitments, private R2 stores document bytes, and private services handle configured document checks.',
      'An outbox publisher feeds queues. A consumer claims one attempt before the provider adapter submits it.',
      'Telnyx fax, Pingen printing and post, and Resend email are external to Cloudflare. Verified callbacks and reconciliation return facts to the domain service; this architecture does not claim live qualification or processing residency.',
    ],
  },
  dispatch: {
    title: 'Approval, acceptance and uncertainty',
    caption: 'Approval is a separate immutable record. The atomic D1 commitment leads to queued work and one claimed provider attempt; an unknown outcome stops automatic resubmission.',
    width: 640,
    text: [
      'A prepared dispatch identifies exact content, recipient, options and quote. A separate approval record binds that commitment and current authenticated authority.',
      'One D1 acceptance transaction verifies approval, reserves quota and writes the outbox before the dispatch becomes queued. A conditional claim moves an eligible attempt to submitting.',
      'Known provider responses can establish accepted or failed. An uncertain response or expired lease leads to submission_unknown and provider-specific reconciliation, never automatic resubmission. Later channel events describe delivery separately from acceptance.',
    ],
  },
  documents: {
    title: 'Data, templates and derived documents',
    caption: 'Mapped data and a concrete Studio template version feed generation. Adding a postal address page is a separate derivation from an uploaded original; both paths produce a new private document.',
    width: 600,
    text: [
      'Parsed source data passes through an explicit mapping profile. A concrete template version and settings join those mapped inputs in a generation job, which records artifacts and provenance.',
      'Uploaded originals retain their identity and exact stored bytes under the applicable access and retention rules. Adding a postal address page creates a separate derived PDF; the original PDF is not an imported Studio template input.',
      'Derived documents still need applicable scan, validation and preview checks before later immutable approval and separate dispatch acceptance. Generation itself grants no delivery authority.',
    ],
  },
};

/** Preserve the figure's full meaning in Nimbus's Markdown projection. */
export function diagramMarkdown(id: DiagramId, mermaid = false): string {
  const diagram = diagrams[id] ?? diagrams.system;
  if (mermaid) {
    const logical = mermaidDiagrams[diagram.id];
    return `\n**Mermaid · ${logical.title}**\n\n![${logical.title}](/illustrations/${diagram.asset}-mermaid.svg)\n\n${logical.caption}\n\n${logical.text.map((paragraph) => `- ${paragraph}`).join('\n')}\n\n[Open full-size SVG](/illustrations/${diagram.asset}-mermaid.svg) · [Download SVG](/illustrations/${diagram.asset}-mermaid.svg) · [Mermaid source](/illustrations/${diagram.asset}.mmd)\n`;
  }
  return `\n![${diagram.title}](/illustrations/${diagram.asset}.svg)\n\n${diagram.caption}\n\n${diagram.steps.map((step, i) => `${i + 1}. **${step.label}.** ${step.detail}`).join('\n')}\n\n[Download SVG](/illustrations/${diagram.asset}.svg)\n`;
}
