import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Plus,
  UploadSimple,
  FileText,
  Check,
  ArrowLeft,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  api,
  bytes,
  date,
  money,
  recipientOf,
  type Channel,
  type Dispatch,
  type DispatchDetail,
  type DocumentRecord,
  type Page,
  type Sender,
} from "./api";
import { fr as t } from "./i18n";
import {
  ChannelLabel,
  Definition,
  DispatchTable,
  EmailPreview,
  EmptyState,
  ErrorNotice,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  PdfPreview,
  RefreshButton,
  Status,
  useAction,
  useResource,
} from "./components";

export function Overview() {
  const documents = useResource<Page<DocumentRecord>>("/documents");
  const dispatches = useResource<Page<Dispatch>>("/dispatches");
  return (
    <>
      <PageHeading title={t.overview.title} intro={t.overview.intro} />
      <div className="overview-stats">
        <div>
          <span>{t.overview.documents}</span>
          <strong>{documents.data?.items.length ?? "·"}</strong>
        </div>
        <div>
          <span>{t.overview.waiting}</span>
          <strong>
            {dispatches.data?.items.filter((d) =>
              ["prepared", "draft"].includes(d.status),
            ).length ?? "·"}
          </strong>
        </div>
        <div>
          <span>{t.overview.tracked}</span>
          <strong>{dispatches.data?.items.length ?? "·"}</strong>
        </div>
      </div>
      <ErrorNotice
        error={documents.error ?? dispatches.error}
        retry={() => {
          documents.refresh();
          dispatches.refresh();
        }}
      />
      <div className="section-toolbar">
        <h2>{t.overview.recent}</h2>
        <a href="#/app/dispatches" className="text-link">
          {t.overview.all}
          <ArrowRight size={17} />
        </a>
      </div>
      {dispatches.loading && !dispatches.data ? (
        <Loading />
      ) : dispatches.data?.items.length ? (
        <DispatchTable items={dispatches.data.items.slice(0, 6)} />
      ) : (
        <EmptyState
          title={t.overview.emptyTitle}
          text={t.overview.emptyBody}
          action={
            <a className="button primary" href="#/app/documents">
              {t.documents.import}
              <ArrowRight size={18} />
            </a>
          }
        />
      )}
      <aside className="connection-callout">
        <div>
          <h2>{t.overview.connectionTitle}</h2>
          <p>{t.overview.connectionBody}</p>
        </div>
        <a className="button" href="#/app/connection">
          {t.overview.connect}
          <ArrowRight size={18} />
        </a>
      </aside>
    </>
  );
}

export function Documents() {
  const resource = useResource<Page<DocumentRecord>>("/documents");
  const action = useAction();
  const [tab, setTab] = useState<"import" | "render" | null>(null);
  const [selected, setSelected] = useState<DocumentRecord>();
  const [name, setName] = useState("");
  const [html, setHtml] = useState(t.documents.defaultHtml);
  const file = useRef<HTMLInputElement>(null);
  async function upload(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const chosen = file.current?.files?.[0];
      if (!chosen) return;
      const form = new FormData();
      form.append("file", chosen);
      const document = await api<DocumentRecord>("/documents", {
        method: "POST",
        body: form,
      });
      setSelected(document);
      setTab(null);
      resource.refresh();
    });
  }
  async function render(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const document = await api<DocumentRecord>("/documents/render", {
        method: "POST",
        body: { name, html },
      });
      setSelected(document);
      setTab(null);
      resource.refresh();
    });
  }
  return (
    <>
      <PageHeading
        title={t.documents.title}
        intro={t.documents.intro}
        action={
          <div className="button-group">
            <button
              className="button"
              onClick={() => {
                setTab("render");
                action.clear();
              }}
            >
              <FileText size={18} />
              {t.documents.render}
            </button>
            <button
              className="button primary"
              onClick={() => {
                setTab("import");
                action.clear();
              }}
            >
              <UploadSimple size={18} />
              {t.documents.import}
            </button>
          </div>
        }
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      <ErrorNotice error={action.error} />
      {tab && (
        <section className="form-panel">
          <div className="section-toolbar">
            <h2>
              {tab === "import"
                ? t.documents.uploadTitle
                : t.documents.renderTitle}
            </h2>
            <button className="text-button" onClick={() => setTab(null)}>
              {t.close}
            </button>
          </div>
          {tab === "import" ? (
            <form onSubmit={(e) => void upload(e)}>
              <p>{t.documents.uploadBody}</p>
              <Field label={t.documents.file} hint={t.documents.fileHint}>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  ref={file}
                />
              </Field>
              <button className="button primary" disabled={action.pending}>
                {action.pending ? t.loading : t.documents.upload}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void render(e)}>
              <Field label={t.documents.name}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.documents.namePlaceholder}
                  required
                  maxLength={160}
                />
              </Field>
              <Field label={t.documents.html} hint={t.documents.htmlHint}>
                <textarea
                  className="code-input"
                  rows={9}
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  required
                  maxLength={150000}
                />
              </Field>
              <button className="button primary" disabled={action.pending}>
                {action.pending ? t.loading : t.documents.renderAction}
              </button>
            </form>
          )}
        </section>
      )}
      {selected && (
        <section className="document-detail">
          <div className="section-toolbar">
            <div>
              <h2>{selected.name}</h2>
              <Status status={selected.status} />
            </div>
            <button
              className="text-button"
              onClick={() => setSelected(undefined)}
            >
              {t.close}
            </button>
          </div>
          {["quarantined", "quarantine"].includes(selected.status) ? (
            <div className="notice warning">
              <WarningCircle size={22} />
              <p>{t.documents.quarantine}</p>
            </div>
          ) : (
            <PdfPreview id={selected.id} />
          )}
          <dl className="document-metadata">
            <Definition label={t.documents.pages}>{selected.pages}</Definition>
            <Definition label={t.documents.size}>
              {bytes(selected.size)}
            </Definition>
            <Definition label={t.documents.source}>
              {selected.source === "import"
                ? t.documents.exact
                : t.documents.generated}
            </Definition>
            <Definition label={t.documents.integrity}>
              <code>{selected.sha256}</code>
            </Definition>
          </dl>
          <a
            className={`button primary ${["quarantined", "quarantine"].includes(selected.status) ? "disabled-link" : ""}`}
            href={`#/app/prepare?document=${selected.id}`}
            aria-disabled={["quarantined", "quarantine"].includes(
              selected.status,
            )}
          >
            {t.documents.ready}
            <ArrowRight size={18} />
          </a>
        </section>
      )}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : resource.data?.items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.document}</th>
                <th>{t.documents.pages}</th>
                <th>{t.documents.source}</th>
                <th>{t.status}</th>
                <th>{t.created}</th>
                <th>
                  <span className="sr-only">{t.open}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button
                      className="row-link text-button"
                      onClick={() => setSelected(d)}
                    >
                      {d.name}
                      <span className="reference mono">{d.id}</span>
                    </button>
                  </td>
                  <td>{d.pages}</td>
                  <td>
                    {d.source === "import"
                      ? t.documents.exact
                      : t.documents.generated}
                  </td>
                  <td>
                    <Status status={d.status} />
                  </td>
                  <td className="date-cell">{date(d.created_at)}</td>
                  <td>
                    <button
                      className="icon-link"
                      aria-label={`${t.preview} ${d.name}`}
                      onClick={() => setSelected(d)}
                    >
                      <ArrowRight size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={t.documents.emptyTitle}
          text={t.documents.emptyBody}
        />
      )}
      <LoadMore
        path="/documents"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </>
  );
}

export function PrepareDispatch({
  initialDocument,
}: {
  initialDocument: string;
}) {
  const documents = useResource<Page<DocumentRecord>>("/documents");
  const senders = useResource<{ items: Sender[] }>("/senders");
  const action = useAction();
  const key = useRef(crypto.randomUUID());
  const [channel, setChannel] = useState<Channel>("fax");
  const [documentId, setDocumentId] = useState(initialDocument);
  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [ceiling, setCeiling] = useState("500");
  const [recipient, setRecipient] = useState<Record<string, string>>({
    country: "FR",
  });
  const available =
    documents.data?.items.filter((d) =>
      ["ready", "clean"].includes(d.status),
    ) ?? [];
  const matchingSenders =
    senders.data?.items.filter((s) => s.channel === channel) ?? [];
  const selectedSender =
    matchingSenders.find((s) => s.id === senderId)?.id ??
    matchingSenders[0]?.id;
  const setAddress = (field: string, value: string) => {
    setRecipient((r) => ({ ...r, [field]: value }));
    key.current = crypto.randomUUID();
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const target =
        channel === "fax"
          ? { phone: recipient.phone ?? "" }
          : channel === "email"
            ? { email: recipient.email ?? "" }
            : {
                name: recipient.name ?? "",
                line1: recipient.line1 ?? "",
                postalCode: recipient.postalCode ?? "",
                city: recipient.city ?? "",
                country: recipient.country ?? "FR",
              };
      const dispatch = await api<Dispatch>("/dispatches", {
        method: "POST",
        key: key.current,
        body: {
          channel,
          recipient: target,
          documentId: documentId || undefined,
          senderId: selectedSender,
          subject: channel === "email" ? subject : undefined,
          html: channel === "email" ? html : undefined,
          text: channel === "email" ? text : undefined,
          ceilingMinor: Number(ceiling),
        },
      });
      go(`/app/dispatch/${dispatch.id}`);
    });
  }
  const changed = () => {
    key.current = crypto.randomUUID();
  };
  return (
    <>
      <PageHeading title={t.dispatch.title} intro={t.dispatch.intro} />
      <ErrorNotice error={documents.error ?? senders.error ?? action.error} />
      <form
        className="prepare-layout"
        onSubmit={(e) => void submit(e)}
        onChange={changed}
      >
        <div className="prepare-fields">
          <fieldset className="channel-selector">
            <legend>{t.channel}</legend>
            {(["fax", "email", "postal"] as const).map((c) => (
              <label key={c}>
                <input
                  type="radio"
                  name="channel"
                  value={c}
                  checked={channel === c}
                  onChange={() => {
                    setChannel(c);
                    setSenderId("");
                  }}
                />
                <span>{t.channels[c]}</span>
              </label>
            ))}
          </fieldset>
          <Field
            label={channel === "email" ? t.dispatch.attachment : t.document}
          >
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              required={channel !== "email"}
            >
              <option value="">
                {channel === "email"
                  ? t.dispatch.none
                  : t.dispatch.chooseDocument}
              </option>
              {initialDocument &&
                !available.some((d) => d.id === initialDocument) && (
                  <option value={initialDocument}>
                    {t.document} · {initialDocument}
                  </option>
                )}
              {available.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name} · {d.pages} p.
                </option>
              ))}
            </select>
          </Field>
          <LoadMore
            path="/documents"
            data={documents.data}
            onLoaded={documents.setData}
          />
          {!available.length && channel !== "email" && (
            <p className="field-hint">
              {t.dispatch.noDocument}{" "}
              <a href="#/app/documents">{t.documents.import}</a>
            </p>
          )}
          <Field label={t.dispatch.sender}>
            <select
              value={selectedSender ?? ""}
              onChange={(e) => setSenderId(e.target.value)}
            >
              {matchingSenders.length ? (
                matchingSenders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? s.address ?? s.id}
                  </option>
                ))
              ) : (
                <option value="">{t.dispatch.defaultSender}</option>
              )}
            </select>
          </Field>
          <div className="form-divider" />
          {channel === "fax" ? (
            <Field label={t.dispatch.phone}>
              <input
                type="tel"
                inputMode="tel"
                pattern="\+[1-9][0-9]{7,14}"
                placeholder={t.dispatch.phonePlaceholder}
                value={recipient.phone ?? ""}
                onChange={(e) => setAddress("phone", e.target.value)}
                required
              />
            </Field>
          ) : channel === "email" ? (
            <>
              <Field label={t.dispatch.email}>
                <input
                  type="email"
                  placeholder={t.dispatch.emailPlaceholder}
                  value={recipient.email ?? ""}
                  onChange={(e) => setAddress("email", e.target.value)}
                  required
                />
              </Field>
              <Field label={t.dispatch.subject}>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  maxLength={200}
                />
              </Field>
              <Field label={t.dispatch.html}>
                <textarea
                  rows={6}
                  className="code-input"
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  required
                />
              </Field>
              <Field label={t.dispatch.text} hint={t.dispatch.textHelp}>
                <textarea
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t.dispatch.postalName}>
                <input
                  value={recipient.name ?? ""}
                  onChange={(e) => setAddress("name", e.target.value)}
                  required
                  autoComplete="name"
                />
              </Field>
              <Field label={t.dispatch.line1}>
                <input
                  value={recipient.line1 ?? ""}
                  onChange={(e) => setAddress("line1", e.target.value)}
                  required
                  autoComplete="address-line1"
                />
              </Field>
              <div className="field-row">
                <Field label={t.dispatch.postalCode}>
                  <input
                    value={recipient.postalCode ?? ""}
                    onChange={(e) => setAddress("postalCode", e.target.value)}
                    required
                    autoComplete="postal-code"
                  />
                </Field>
                <Field label={t.dispatch.city}>
                  <input
                    value={recipient.city ?? ""}
                    onChange={(e) => setAddress("city", e.target.value)}
                    required
                    autoComplete="address-level2"
                  />
                </Field>
              </div>
              <Field label={t.dispatch.country}>
                <select
                  value={recipient.country}
                  onChange={(e) => setAddress("country", e.target.value)}
                >
                  {Object.entries(t.dispatch.countries).map(([code, name]) => (
                    <option value={code} key={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label={t.dispatch.ceiling} hint={t.dispatch.ceilingHelp}>
            <input
              type="number"
              value={ceiling}
              onChange={(e) => setCeiling(e.target.value)}
              min="0"
              step="1"
              max="1000000"
              required
            />
          </Field>
          <button
            className="button primary full"
            disabled={action.pending || (channel !== "email" && !documentId)}
          >
            {action.pending ? t.dispatch.preparing : t.dispatch.prepare}
            <ArrowRight size={18} />
          </button>
        </div>
        <aside className="prepare-preview">
          {channel === "email" && html ? (
            <>
              <h2>{t.dispatch.htmlPreview}</h2>
              <EmailPreview html={html} />
            </>
          ) : documentId ? (
            <PdfPreview id={documentId} />
          ) : (
            <div className="preview-empty">
              <FileText size={54} weight="light" />
              <p>{t.dispatch.chooseDocument}</p>
            </div>
          )}
          <div className="approval-explainer">
            <ShieldCheck size={25} weight="light" />
            <p>{t.dispatch.approvalExplain}</p>
          </div>
        </aside>
      </form>
    </>
  );
}

export function DispatchList() {
  const resource = useResource<Page<Dispatch>>("/dispatches");
  return (
    <>
      <PageHeading
        title={t.dispatch.listTitle}
        intro={t.dispatch.listIntro}
        action={
          <a className="button primary" href="#/app/prepare">
            <Plus size={18} />
            {t.dispatch.new}
          </a>
        }
      />
      <div className="section-toolbar">
        <span>{t.nav.dispatches}</span>
        <RefreshButton onClick={resource.refresh} disabled={resource.loading} />
      </div>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        resource.data && <DispatchTable items={resource.data.items} />
      )}
      <LoadMore
        path="/dispatches"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </>
  );
}

export function DispatchDetailPage({
  id,
  simulation,
}: {
  id: string;
  simulation: boolean;
}) {
  const resource = useResource<DispatchDetail>(
    `/dispatches/${encodeURIComponent(id)}`,
  );
  const action = useAction();
  const [consent, setConsent] = useState(false);
  const d = resource.data?.dispatch;
  useEffect(() => {
    setConsent(false);
  }, [id]);
  useEffect(() => {
    const expiresAt = resource.data?.approval?.expires_at;
    if (!expiresAt) return;
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now()) + 100;
    const timeout = window.setTimeout(resource.refresh, delay);
    return () => window.clearTimeout(timeout);
  }, [resource.data?.approval?.expires_at, resource.refresh]);
  useEffect(() => {
    if (
      !d ||
      !["accepted", "queued", "submitting", "submitted", "sending"].includes(
        d.status,
      )
    )
      return;
    const interval = window.setInterval(resource.refresh, 3000);
    return () => window.clearInterval(interval);
  }, [d?.status, resource.refresh]);
  if (!d && resource.loading) return <Loading />;
  if (!d)
    return <ErrorNotice error={resource.error} retry={resource.refresh} />;
  const target = recipientOf(d);
  const pendingApproval = ["prepared", "draft"].includes(d.status);
  const approved =
    pendingApproval &&
    resource.data?.approval?.fingerprint === d.fingerprint &&
    Date.parse(resource.data.approval.expires_at) > Date.now();
  const uncertain = ["submission_unknown", "reconciliation_required"].includes(
    d.status,
  );
  const cancelAllowed = [
    "prepared",
    "draft",
    "approved",
    "accepted",
    "queued",
  ].includes(d.status);
  async function approve() {
    await action.run(async () => {
      await api(`/dispatches/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: { fingerprint: d?.fingerprint },
      });
      resource.refresh();
    });
  }
  async function confirm() {
    await action.run(async () => {
      await api(`/dispatches/${encodeURIComponent(id)}/confirm`, {
        method: "POST",
        key: `web-confirm:${id}`,
        body: {},
      });
      resource.refresh();
    });
  }
  async function cancel() {
    await action.run(async () => {
      await api(`/dispatches/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: {},
      });
      resource.refresh();
    });
  }
  const events = resource.data?.events ?? [];
  return (
    <>
      <a className="back-link" href="#/app/dispatches">
        <ArrowLeft size={17} />
        {t.nav.dispatches}
      </a>
      <PageHeading
        title={
          pendingApproval || approved
            ? t.dispatch.reviewTitle
            : t.dispatch.listTitle
        }
        intro={
          pendingApproval || approved
            ? t.dispatch.reviewIntro
            : t.dispatch.deliveryNote
        }
        action={
          <RefreshButton
            onClick={resource.refresh}
            disabled={resource.loading}
          />
        }
      />
      <div className="dispatch-reference">
        <code>{d.id}</code>
        <Status status={approved ? "approved" : d.status} channel={d.channel} />
        {d.mode === "simulation" && (
          <span className="simulation-stamp">{t.simulation}</span>
        )}
      </div>
      <p className="field-hint">{t.dispatch.channelNotes[d.channel]}</p>
      <ErrorNotice error={action.error ?? resource.error} />
      {uncertain && (
        <div className="notice warning">
          <WarningCircle size={25} />
          <p>{t.dispatch.uncertain}</p>
        </div>
      )}
      <div className="dispatch-detail-layout">
        <section>
          <dl className="dispatch-facts">
            <Definition label={t.channel}>
              <ChannelLabel channel={d.channel} />
            </Definition>
            <Definition label={t.dispatch.recipientDetails}>
              <address>
                {Object.values(target)
                  .filter(Boolean)
                  .map((value, index) => (
                    <span key={index}>{value}</span>
                  ))}
              </address>
            </Definition>
            {d.subject && (
              <Definition label={t.dispatch.subject}>{d.subject}</Definition>
            )}
            <Definition label={t.dispatch.sender}>
              {d.sender_address ?? t.unknown}
            </Definition>
            <Definition label={t.dispatch.estimate}>
              {money(d.estimated_minor, d.currency)}
            </Definition>
            <Definition label={t.dispatch.ceilingLabel}>
              {money(d.ceiling_minor, d.currency)}
            </Definition>
            <Definition label={t.created}>{date(d.created_at)}</Definition>
          </dl>
          {d.mode === "simulation" && (
            <p className="field-hint">{t.simulationCost}</p>
          )}
          {pendingApproval && !approved && (
            <section className="approval-panel">
              <p>{t.dispatch.approvalExplain}</p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>{t.dispatch.approvalCheck}</span>
              </label>
              <button
                className="button primary full"
                disabled={!consent || action.pending || resource.loading}
                onClick={() => void approve()}
              >
                <Check size={18} />
                {action.pending ? t.loading : t.dispatch.approve}
              </button>
            </section>
          )}
          {approved && (
            <section className="approval-panel">
              <p>
                <Check size={18} />
                {t.dispatch.approved}
              </p>
              <button
                className="button primary full"
                disabled={action.pending}
                onClick={() => void confirm()}
              >
                {action.pending
                  ? t.loading
                  : simulation
                    ? t.dispatch.confirm
                    : t.dispatch.confirmReal}
                <ArrowRight size={18} />
              </button>
            </section>
          )}
          {cancelAllowed && (
            <button
              className="text-button cancel-button"
              disabled={action.pending}
              onClick={() => void cancel()}
            >
              {t.dispatch.cancelAction}
            </button>
          )}
          <details className="technical-details">
            <summary>{t.dispatch.version}</summary>
            <p>{t.dispatch.noChange}</p>
            <dl>
              <Definition label={t.dispatch.fingerprint}>
                <code>{d.fingerprint}</code>
              </Definition>
              {d.document_id && (
                <Definition label={t.document}>
                  <code>{d.document_id}</code>
                </Definition>
              )}
            </dl>
          </details>
        </section>
        <section className="content-preview">
          {d.html && (
            <>
              <h2>{t.dispatch.htmlPreview}</h2>
              <EmailPreview html={d.html} />
              <details className="text-version">
                <summary>{t.dispatch.textPreview}</summary>
                <pre>{d.text}</pre>
              </details>
            </>
          )}
          {d.document_id && (
            <PdfPreview id={d.document_id} title={t.dispatch.documentPreview} />
          )}
        </section>
      </div>
      <section className="timeline-section">
        <h2>{t.dispatch.timeline}</h2>
        {!events.length ? (
          <p className="muted">{t.dispatch.noEvents}</p>
        ) : (
          <ol className="timeline">
            {events.map((event) => {
              const record = event as typeof event & {
                kind?: string;
                occurred_at?: string;
                received_at?: string;
              };
              const name =
                record.kind ??
                event.type ??
                event.event_type ??
                event.status ??
                t.status;
              return (
                <li key={event.id}>
                  <span className="timeline-mark" aria-hidden="true" />
                  <div>
                    <strong>
                      {(name === "delivered" && d.channel === "email"
                        ? t.statuses.email_delivered
                        : name === "delivered" && d.channel === "fax"
                          ? t.statuses.fax_delivered
                          : t.statuses[name]) ??
                        name.replaceAll(".", " · ").replaceAll("_", " ")}
                    </strong>
                    <time>
                      {date(
                        record.occurred_at ??
                          event.created_at ??
                          record.received_at,
                      )}
                    </time>
                    {event.detail && <p>{event.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <details className="technical-details">
          <summary>{t.dispatch.attempts}</summary>
          {!resource.data?.attempts.length ? (
            <p>{t.dispatch.noAttempts}</p>
          ) : (
            <ul className="attempts">
              {resource.data.attempts.map((attempt) => (
                <li key={attempt.id}>
                  <span>{attempt.provider}</span>
                  <Status status={attempt.status} />
                  <time>{date(attempt.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>
    </>
  );
}
