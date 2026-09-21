import { useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  WarningCircle,
  ShieldCheck,
} from "@phosphor-icons/react";
import {
  api,
  date,
  money,
  isPublicPreview,
  type Channel,
  type Dispatch,
  type DocumentRecord,
  type Page,
  type Sender,
} from "./api";
import { ProtectedDocumentChoice } from "./protected-document";
import {
  DistributionRoadmap,
  EmailComposer,
  emailHtml,
} from "./email-composer";
import { fr as t } from "./i18n";
import { CreditBalance, type WelcomeCredit } from "./credit-balance";
import type { PostalSetup } from "../../../packages/contracts/src/postal-setup";
import { PostalSetupPanel } from "./postal-setup-panel";
import {
  ChannelLabel,
  Definition,
  DispatchTable,
  EmptyState,
  ErrorNotice,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  RefreshButton,
  Status,
  useAction,
  useResource,
} from "./components";

type Campaign = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};
type ValidatedRow = {
  line: number;
  channel: Channel;
  recipient: Record<string, string>;
};
type CsvResult = {
  rows: ValidatedRow[];
  errors: { line: number; message: string }[];
  duplicates: { line: number; duplicateOf: number }[];
  valid: boolean;
};

export function Campaigns({ simulation }: { simulation: boolean }) {
  const campaigns = useResource<Page<Campaign>>("/campaigns");
  const documents = useResource<Page<DocumentRecord>>("/documents");
  const action = useAction();
  const [name, setName] = useState("");
  const [csv, setCsv] = useState("");
  const [validated, setValidated] = useState<CsvResult>();
  const [validatedCsv, setValidatedCsv] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [protectedLink, setProtectedLink] = useState(false);
  const [protectedDays, setProtectedDays] = useState<1 | 7 | 30>(7);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [plain, setPlain] = useState("");
  const [progress, setProgress] = useState(0);
  const campaignId = useRef<string | undefined>(undefined);
  const prepared = useRef(new Set<number>());
  const requestKey = useRef(crypto.randomUUID());
  const hasEmail = validated?.rows.some((row) => row.channel === "email");
  const needsDocument = validated?.rows.some((row) => row.channel !== "email");
  async function validate() {
    await action.run(async () => {
      const result = await api<CsvResult>("/recipients/validate", {
        method: "POST",
        body: { csv },
      });
      setValidated(result);
      setValidatedCsv(csv);
    });
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (
        !validated ||
        validatedCsv !== csv ||
        !validated.rows.length ||
        validated.errors.length ||
        validated.duplicates.length
      )
        throw new Error(t.campaigns.noValidated);
      if (!campaignId.current) {
        const campaign = await api<Campaign>("/campaigns", {
          method: "POST",
          body: { name },
          key: `campaign:${requestKey.current}`,
        });
        campaignId.current = campaign.id;
      }
      for (const row of validated.rows) {
        if (prepared.current.has(row.line)) continue;
        await api<Dispatch>("/dispatches", {
          method: "POST",
          key: `campaign:${requestKey.current}:line:${row.line}`,
          body: {
            campaignId: campaignId.current,
            channel: row.channel,
            recipient: row.recipient,
            documentId: documentId || undefined,
            subject: row.channel === "email" ? subject : undefined,
            html: row.channel === "email" ? emailHtml(plain, html) : undefined,
            text: row.channel === "email" ? plain : undefined,
            options:
              row.channel === "email" && documentId && protectedLink
                ? { emailDeliveryMode: "protected_link", protectedDays }
                : undefined,
            ceilingMinor: 500,
          },
        });
        prepared.current.add(row.line);
        setProgress(prepared.current.size);
      }
      go(`/app/campaign/${campaignId.current}`);
    });
  }
  const locked = !!campaignId.current;
  return (
    <>
      <PageHeading title={t.campaigns.title} intro={t.campaigns.intro} />
      <DistributionRoadmap />
      <ErrorNotice error={action.error ?? campaigns.error ?? documents.error} />
      {campaignId.current && action.error && (
        <div className="notice warning">
          <WarningCircle size={22} />
          <div>
            <p>
              {progress} / {validated?.rows.length ?? 0}{" "}
              {t.campaigns.total.toLowerCase()} {t.campaigns.partial}
            </p>
            <a href={`#/app/campaign/${campaignId.current}`}>
              {t.campaigns.inspect}
            </a>
          </div>
        </div>
      )}
      <form className="campaign-layout" onSubmit={(e) => void create(e)}>
        <section className="form-panel">
          <Field label={t.campaigns.name}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.campaigns.namePlaceholder}
              maxLength={120}
              required
              disabled={locked}
            />
          </Field>
          <Field label={t.campaigns.csvFile}>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={locked}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void action.run(async () => {
                    if (file.size > 1024 * 1024)
                      throw new Error(t.campaigns.tooLarge);
                    setCsv(await file.text());
                    setValidated(undefined);
                  });
              }}
            />
          </Field>
          <Field label={t.campaigns.csv} hint={t.campaigns.csvHelp}>
            <textarea
              className="code-input"
              rows={8}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setValidated(undefined);
              }}
              placeholder={t.campaigns.sample}
              required
              disabled={locked}
            />
          </Field>
          <button
            type="button"
            className="button"
            onClick={() => void validate()}
            disabled={!csv || action.pending || locked}
          >
            {action.pending ? t.loading : t.campaigns.validate}
            <Check size={18} />
          </button>
          {validated && (
            <section className="csv-result" aria-live="polite">
              <h3>{t.campaigns.validationTitle}</h3>
              <dl className="csv-counts">
                <Definition label={t.campaigns.valid}>
                  {validated.rows.length}
                </Definition>
                <Definition label={t.campaigns.errors}>
                  {validated.errors.length}
                </Definition>
                <Definition label={t.campaigns.duplicates}>
                  {validated.duplicates.length}
                </Definition>
              </dl>
              {validated.rows.length > 0 && (
                <div className="table-scroll csv-preview">
                  <table className="responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          {t.campaigns.row}
                        </th>
                        <th role="columnheader" scope="col">
                          {t.channel}
                        </th>
                        <th role="columnheader" scope="col">
                          {t.recipient}
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {validated.rows.slice(0, 25).map((row) => (
                        <tr role="row" key={row.line}>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {t.campaigns.row}
                            </span>
                            {row.line}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {t.channel}
                            </span>
                            {t.channels[row.channel]}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {t.recipient}
                            </span>
                            {Object.values(row.recipient)
                              .filter(Boolean)
                              .join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {validated.rows.length > 25 && (
                <p className="field-hint">{t.campaigns.previewLimited}</p>
              )}
              {validated.errors.length > 0 && (
                <ul className="validation-errors">
                  {validated.errors.map((error, index) => (
                    <li key={index}>
                      {t.campaigns.row} {error.line} : {error.message}
                    </li>
                  ))}
                </ul>
              )}
              {validated.duplicates.length > 0 && (
                <ul className="validation-errors">
                  {validated.duplicates.map((duplicate, index) => (
                    <li key={index}>
                      {t.campaigns.row} {duplicate.line} :{" "}
                      {t.campaigns.duplicateOf} {duplicate.duplicateOf}
                    </li>
                  ))}
                </ul>
              )}
              {!validated.errors.length && !validated.duplicates.length ? (
                <p className="success-copy">
                  <Check size={18} />
                  {t.campaigns.noErrors}
                </p>
              ) : (
                <p>{t.campaigns.correction}</p>
              )}
            </section>
          )}
        </section>
        <section className="form-panel">
          <h2>{t.campaigns.document}</h2>
          <Field label={t.document}>
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              required={needsDocument}
              disabled={locked}
            >
              <option value="">{t.dispatch.chooseDocument}</option>
              {documents.data?.items
                .filter((d) => ["ready", "clean"].includes(d.status))
                .map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
          <LoadMore
            path="/documents"
            data={documents.data}
            onLoaded={documents.setData}
          />
          {hasEmail &&
            documentId &&
            !simulation &&
            !isPublicPreview &&
            !locked && (
              <ProtectedDocumentChoice
                enabled={protectedLink}
                days={protectedDays}
                onEnabled={setProtectedLink}
                onDays={setProtectedDays}
              />
            )}
          {hasEmail && (
            <>
              <Field label={t.campaigns.emailSubject}>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  disabled={locked}
                />
              </Field>
              <EmailComposer
                text={plain}
                html={html}
                onText={setPlain}
                onHtml={setHtml}
                disabled={locked}
              />
            </>
          )}
          <p className="field-hint">{t.campaigns.approvalNote}</p>
          <p className="field-hint">
            {t.campaigns.ceiling} : {money(500)} {t.campaigns.perRecipient}{" "}
            {t.simulationCost}
          </p>
          <button
            className="button primary full"
            disabled={
              action.pending ||
              !validated?.rows.length ||
              !!validated.errors.length ||
              !!validated.duplicates.length
            }
          >
            {action.pending
              ? `${t.loading} ${progress}/${validated?.rows.length ?? 0}`
              : t.campaigns.create}
            <ArrowRight size={18} />
          </button>
        </section>
      </form>
      <div className="section-toolbar">
        <h2>{t.campaigns.list}</h2>
        <RefreshButton onClick={campaigns.refresh} />
      </div>
      {campaigns.loading && !campaigns.data ? (
        <Loading />
      ) : !campaigns.data?.items.length ? (
        <EmptyState title={t.campaigns.empty} />
      ) : (
        <div className="table-scroll">
          <table className="responsive-table" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  {t.campaigns.name}
                </th>
                <th role="columnheader" scope="col">
                  {t.status}
                </th>
                <th role="columnheader" scope="col">
                  {t.created}
                </th>
                <th role="columnheader" scope="col">
                  <span className="sr-only">{t.open}</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {campaigns.data.items.map((campaign) => (
                <tr role="row" key={campaign.id}>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.campaigns.name}
                    </span>
                    <a
                      className="row-link"
                      href={`#/app/campaign/${campaign.id}`}
                    >
                      {campaign.name}
                      <span className="reference mono">{campaign.id}</span>
                    </a>
                  </td>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.status}
                    </span>
                    <Status status={campaign.status} />
                  </td>
                  <td role="cell" className="date-cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.created}
                    </span>
                    {date(campaign.created_at)}
                  </td>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.open}
                    </span>
                    <a
                      className="icon-link"
                      href={`#/app/campaign/${campaign.id}`}
                      aria-label={`${t.open} ${campaign.name}`}
                    >
                      <ArrowRight size={19} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore
        path="/campaigns"
        data={campaigns.data}
        onLoaded={campaigns.setData}
      />
    </>
  );
}

export function CampaignDetail({ id }: { id: string }) {
  const resource = useResource<{ campaign: Campaign; dispatches: Dispatch[] }>(
    `/campaigns/${encodeURIComponent(id)}`,
  );
  return (
    <>
      <a className="back-link" href="#/app/campaigns">
        <ArrowLeft size={18} />
        {t.nav.campaigns}
      </a>
      <PageHeading
        title={resource.data?.campaign.name ?? t.campaigns.detail}
        intro={t.campaigns.approvalNote}
        action={<RefreshButton onClick={resource.refresh} />}
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        resource.data && (
          <>
            <div className="dispatch-reference">
              <code>{id}</code>
              <Status status={resource.data.campaign.status} />
              <span>
                {resource.data.dispatches.length}{" "}
                {t.campaigns.total.toLowerCase()}
              </span>
            </div>
            <DispatchTable items={resource.data.dispatches} />
          </>
        )
      )}
    </>
  );
}

export function Diagnostics({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="muted">{t.unknown}</span>;
  if (typeof value !== "object")
    return (
      <span>
        {typeof value === "boolean" ? (value ? t.yes : t.no) : String(value)}
      </span>
    );
  if (Array.isArray(value))
    return (
      <ul className="diagnostic-list">
        {value.map((item, i) => (
          <li key={i}>
            <Diagnostics value={item} />
          </li>
        ))}
      </ul>
    );
  return (
    <dl className="diagnostics">
      {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
        <div key={key}>
          <dt>{key.replaceAll("_", " ")}</dt>
          <dd>
            <Diagnostics value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Senders() {
  const resource = useResource<{ items: (Sender & { mode?: string })[] }>(
    "/senders",
  );
  const [postalSetup, setPostalSetup] = useState<PostalSetup>();
  const [setupRevision, setSetupRevision] = useState(0);
  return (
    <>
      <PageHeading
        title={t.senders.title}
        intro={t.senders.intro}
        action={
          <RefreshButton
            onClick={() => {
              resource.refresh();
              setSetupRevision((revision) => revision + 1);
            }}
          />
        }
      />
      <PostalSetupPanel
        key={setupRevision}
        onUpdated={resource.refresh}
        onStatus={setPostalSetup}
      />
      {(isPublicPreview ||
        resource.data?.items.some(
          (sender) => sender.mode === "simulation",
        )) && (
        <div className="notice info">
          <ShieldCheck size={23} />
          <p>{t.senders.note}</p>
        </div>
      )}
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : !resource.data?.items.length ? (
        !postalSetup?.available && <EmptyState title={t.senders.empty} />
      ) : (
        <div className="table-scroll">
          <table className="responsive-table" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  {t.senders.profile}
                </th>
                <th role="columnheader" scope="col">
                  {t.channel}
                </th>
                <th role="columnheader" scope="col">
                  {t.senders.address}
                </th>
                <th role="columnheader" scope="col">
                  {t.status}
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {resource.data.items.map((sender) => (
                <tr role="row" key={sender.id}>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.senders.profile}
                    </span>
                    <strong>{sender.name ?? sender.id}</strong>
                    <span className="reference mono">{sender.id}</span>
                  </td>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.channel}
                    </span>
                    <ChannelLabel channel={sender.channel} />
                  </td>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.senders.address}
                    </span>
                    {sender.address ??
                      sender.email ??
                      sender.phone ??
                      t.senders.unavailable}
                  </td>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.status}
                    </span>
                    {sender.id === postalSetup?.sender?.id &&
                    postalSetup.senderVerification ===
                      "administrator_declaration" &&
                    sender.status === "verified" ? (
                      <span className="status">{t.postalSetup.declared}</span>
                    ) : (
                      <Status
                        status={
                          sender.status ??
                          (sender.verified ? "ready" : "pending")
                        }
                      />
                    )}
                    {sender.mode === "simulation" && (
                      <small className="sub-label">{t.simulation}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

type UsageItem = {
  channel: Channel;
  period: string;
  mode?: string;
  limit_count: number;
  reserved_count: number;
  confirmed_count: number;
  limit_minor: number;
  reserved_minor: number;
  confirmed_minor: number;
  currency: string;
};
export function Usage() {
  const resource = useResource<{
    items: UsageItem[];
    welcomeCredit?: WelcomeCredit;
  }>("/usage");
  return (
    <>
      <PageHeading
        title={t.usage.title}
        intro={t.usage.intro}
        action={<RefreshButton onClick={resource.refresh} />}
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.data?.welcomeCredit && (
        <CreditBalance credit={resource.data.welcomeCredit} />
      )}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : !resource.data?.items.length ? (
        <EmptyState title={t.usage.empty} />
      ) : (
        <div className="usage-ledger">
          {resource.data.items.map((item) => (
            <section key={`${item.channel}-${item.period}-${item.mode ?? ""}`}>
              <div className="section-toolbar">
                <h2>{t.channels[item.channel]}</h2>
                <span className="mono">{item.period}</span>
              </div>
              <dl>
                <Definition label={t.usage.reserved}>
                  <strong>{item.reserved_count}</strong>
                  <span>{money(item.reserved_minor, item.currency)}</span>
                </Definition>
                <Definition label={t.usage.consumed}>
                  <strong>{item.confirmed_count}</strong>
                  <span>{money(item.confirmed_minor, item.currency)}</span>
                </Definition>
                <Definition label={t.usage.limit}>
                  <strong>{item.limit_count}</strong>
                  <span>{money(item.limit_minor, item.currency)}</span>
                </Definition>
              </dl>
            </section>
          ))}
        </div>
      )}
      <aside className="notice info">
        <ShieldCheck size={24} />
        <p>{t.usage.note}</p>
      </aside>
    </>
  );
}

export function Admin({ children }: { children?: ReactNode }) {
  const scannerAction = useAction();
  const [scannerMessage, setScannerMessage] = useState("");
  async function warmScanner() {
    setScannerMessage("");
    await scannerAction.run(async () => {
      const response = await api<{ status: string }>("/admin/scanner/warm", {
        method: "POST",
        body: {},
      });
      setScannerMessage(
        response.status === "ready"
          ? "L’analyse des PDF est prête."
          : "Le service prépare l’analyse des PDF. Patientez quelques minutes, puis relancez l’analyse depuis votre document.",
      );
    });
  }
  const diagnostics = useResource<
    Record<string, unknown> & {
      controls?: { channel: Channel; enabled: number }[];
      deadLetters?: {
        id: string;
        dispatch_id: string;
        queue: string;
        received_at: string;
      }[];
    }
  >("/admin");
  const controlAction = useAction();
  async function setChannel(channel: Channel, enabled: boolean) {
    await controlAction.run(async () => {
      await api(`/admin/channels/${channel}`, {
        method: "POST",
        body: { enabled },
      });
      diagnostics.refresh();
    });
  }
  const dispatches = useResource<Page<Dispatch>>("/dispatches");
  const incidents =
    dispatches.data?.items.filter((d) =>
      [
        "submission_unknown",
        "reconciliation_required",
        "failed",
        "rejected",
      ].includes(d.status),
    ) ?? [];
  return (
    <>
      <PageHeading
        title={t.admin.title}
        intro={t.admin.intro}
        action={
          <RefreshButton
            onClick={() => {
              diagnostics.refresh();
              dispatches.refresh();
            }}
          />
        }
      />
      <ErrorNotice
        error={diagnostics.error ?? dispatches.error ?? controlAction.error}
        retry={diagnostics.refresh}
      />
      {children}
      {diagnostics.data?.controls && (
        <section className="channel-controls">
          <h2>{t.admin.channelControls}</h2>
          <p>{t.admin.controlsHelp}</p>
          {diagnostics.data.controls.map((control) => (
            <div key={control.channel} className="channel-control">
              <strong>{t.channels[control.channel]}</strong>
              <span
                className={`status ${control.enabled ? "status-active" : "status-pending"}`}
              >
                {control.enabled ? t.admin.enabled : t.admin.paused}
              </span>
              <button
                className="button small"
                disabled={controlAction.pending}
                onClick={() =>
                  void setChannel(control.channel, !control.enabled)
                }
              >
                {control.enabled ? t.admin.pause : t.admin.resume}
              </button>
            </div>
          ))}
        </section>
      )}
      {!isPublicPreview && (
        <section className="form-panel">
          <h2>Analyse des documents</h2>
          <p>
            Préparez le service avant d’importer vos PDF. Les documents en
            attente restent privés jusqu’à la fin de leur vérification.
          </p>
          <button
            className="button"
            onClick={() => void warmScanner()}
            disabled={scannerAction.pending}
          >
            {scannerAction.pending ? "Préparation…" : "Préparer l’analyse PDF"}
          </button>
          <ErrorNotice error={scannerAction.error} />
          {scannerMessage && <p role="status">{scannerMessage}</p>}
        </section>
      )}
      <h2 className="section-title">{t.admin.uncertain}</h2>
      {dispatches.loading && !dispatches.data ? (
        <Loading />
      ) : incidents.length ? (
        <DispatchTable items={incidents} />
      ) : (
        <p className="empty-inline">{t.admin.noIncidents}</p>
      )}
      <div className="notice warning">
        <WarningCircle size={24} />
        <p>{t.admin.note}</p>
      </div>
      <section className="dead-letters">
        <h2 className="section-title">{t.admin.deadLetters}</h2>
        {diagnostics.data?.deadLetters?.length ? (
          <div className="table-scroll">
            <table className="responsive-table" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    {t.identifier}
                  </th>
                  <th role="columnheader" scope="col">
                    {t.admin.queue}
                  </th>
                  <th role="columnheader" scope="col">
                    {t.created}
                  </th>
                  <th role="columnheader" scope="col">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {diagnostics.data.deadLetters.map((receipt) => (
                  <tr role="row" key={receipt.id}>
                    <td role="cell">
                      <span className="mobile-cell-label" aria-hidden="true">
                        {t.identifier}
                      </span>
                      <code>{receipt.id}</code>
                    </td>
                    <td role="cell">
                      <span className="mobile-cell-label" aria-hidden="true">
                        {t.admin.queue}
                      </span>
                      <code>{receipt.queue}</code>
                    </td>
                    <td role="cell" className="date-cell">
                      <span className="mobile-cell-label" aria-hidden="true">
                        {t.created}
                      </span>
                      {date(receipt.received_at)}
                    </td>
                    <td role="cell">
                      <span className="mobile-cell-label" aria-hidden="true">
                        {t.actions}
                      </span>
                      <a
                        className="text-link"
                        href={`#/app/dispatch/${receipt.dispatch_id}`}
                      >
                        {t.admin.inspectJob}
                        <ArrowRight size={17} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          diagnostics.data && (
            <p className="empty-inline">{t.admin.noDeadLetters}</p>
          )
        )}
      </section>
      <section className="operations-diagnostics">
        <h2>{t.admin.state}</h2>
        {diagnostics.loading && !diagnostics.data ? (
          <Loading />
        ) : (
          <Diagnostics value={diagnostics.data} />
        )}
      </section>
    </>
  );
}
