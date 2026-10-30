import { DataTable, tableTimestamp } from "./data-table";
import { msg } from "./messages";
import { studioRoutes } from "./app-routes";
import { FileInput } from "./file-input";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
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
import { formatLocale, t } from "./locale";
import { ProtectedDocumentChoice } from "./protected-document";
import { DistributionRoadmap, EmailComposer } from "./email-composer";
import { CreditBalance, type WelcomeCredit } from "./credit-balance";
import { UsageActivityCalendar } from "./usage-activity";
import type { PostalSetup } from "../../../packages/contracts/src/postal-setup";
import { PostalSetupPanel } from "./postal-setup-panel";
import {
  ChannelLabel,
  ConfirmAction,
  DateTimezone,
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

export function Campaigns({
  simulation,
  canPrepare = true,
}: {
  simulation: boolean;
  canPrepare?: boolean;
}) {
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
            subject:
              row.channel === "email" && subject.trim() ? subject : undefined,
            html: row.channel === "email" && html.trim() ? html : undefined,
            text: row.channel === "email" && plain.trim() ? plain : undefined,
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
      {!isPublicPreview && canPrepare && (
        <p className="notice info">
          {msg("For a personalised PDF per customer,")}{" "}
          <a href={`#${studioRoutes.datasets}`}>
            {msg("import your data into the Studio")}
          </a>
          .
        </p>
      )}
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
      {canPrepare && (
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
              <FileInput
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
                  <DataTable
                    label={t.campaigns.validationTitle}
                    items={validated.rows}
                    getRowKey={(row) => row.line}
                    columns={[
                      {
                        id: "line",
                        label: t.campaigns.row,
                        value: (row) => row.line,
                      },
                      {
                        id: "channel",
                        label: t.channel,
                        value: (row) => t.channels[row.channel],
                      },
                      {
                        id: "recipient",
                        label: t.recipient,
                        value: (row) =>
                          Object.values(row.recipient)
                            .filter(Boolean)
                            .join(", "),
                      },
                    ]}
                    filters={[
                      {
                        id: "channel",
                        label: t.channel,
                        value: (row) => row.channel,
                        options: [
                          ...new Set(validated.rows.map((row) => row.channel)),
                        ].map((channel) => ({
                          value: channel,
                          label: t.channels[channel],
                        })),
                      },
                    ]}
                  />
                )}
                {validated.errors.length > 0 && (
                  <ul className="validation-errors">
                    {validated.errors.map((error, index) => (
                      <li key={index}>
                        {t.campaigns.row} {error.line} : {msg(error.message)}
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
                <Field
                  label={
                    documentId
                      ? msg("Subject (optional)")
                      : t.campaigns.emailSubject
                  }
                >
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required={!documentId}
                    placeholder={
                      documentId ? msg("Automatic subject") : undefined
                    }
                    disabled={locked}
                  />
                </Field>
                <EmailComposer
                  text={plain}
                  html={html}
                  onText={setPlain}
                  onHtml={setHtml}
                  disabled={locked}
                  documentEmail={!!documentId}
                  documentLink={!!documentId && protectedLink}
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
      )}
      <div className="section-toolbar">
        <h2>{t.campaigns.list}</h2>
        <RefreshButton onClick={campaigns.refresh} />
      </div>
      {!!campaigns.data?.items.length && <DateTimezone />}
      {campaigns.loading && !campaigns.data ? (
        <Loading />
      ) : !campaigns.data?.items.length ? (
        <EmptyState title={t.campaigns.empty} />
      ) : (
        <DataTable
          label={t.campaigns.list}
          items={campaigns.data.items}
          getRowKey={(campaign) => campaign.id}
          columns={[
            {
              id: "name",
              label: t.campaigns.name,
              value: (campaign) => `${campaign.name} ${campaign.id}`,
              render: (campaign) => (
                <a className="row-link" href={`#/app/campaign/${campaign.id}`}>
                  {campaign.name}
                  <span className="reference mono">{campaign.id}</span>
                </a>
              ),
            },
            {
              id: "status",
              label: t.status,
              value: (campaign) =>
                t.statuses[campaign.status] ?? campaign.status,
              render: (campaign) => <Status status={campaign.status} />,
            },
            {
              id: "created",
              label: t.created,
              value: (campaign) => tableTimestamp(campaign.created_at),
              searchValue: (campaign) => date(campaign.created_at),
              render: (campaign) => date(campaign.created_at),
              className: "date-cell",
            },
            {
              id: "actions",
              label: t.open,
              value: () => "",
              sortable: false,
              render: (campaign) => (
                <a
                  className="icon-link"
                  href={`#/app/campaign/${campaign.id}`}
                  aria-label={`${t.open} ${campaign.name}`}
                >
                  <ArrowRight size={19} />
                </a>
              ),
            },
          ]}
          filters={[
            {
              id: "status",
              label: t.status,
              value: (campaign) => campaign.status,
              options: [
                ...new Set(
                  campaigns.data.items.map((campaign) => campaign.status),
                ),
              ].map((status) => ({
                value: status,
                label: t.statuses[status] ?? status,
              })),
            },
          ]}
        />
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

export function Senders({
  canManage = true,
  canPrepare = true,
}: {
  canManage?: boolean;
  canPrepare?: boolean;
}) {
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
        canManage={canManage}
        canPrepare={canPrepare}
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
        <DataTable
          label={t.senders.title}
          items={resource.data.items}
          getRowKey={(sender) => sender.id}
          columns={[
            {
              id: "profile",
              label: t.senders.profile,
              value: (sender) => `${sender.name ?? ""} ${sender.id}`,
              render: (sender) => (
                <>
                  <strong>{sender.name ?? sender.id}</strong>
                  <span className="reference mono">{sender.id}</span>
                </>
              ),
            },
            {
              id: "channel",
              label: t.channel,
              value: (sender) => t.channels[sender.channel],
              render: (sender) => <ChannelLabel channel={sender.channel} />,
            },
            {
              id: "address",
              label: t.senders.address,
              value: (sender) =>
                sender.address ??
                sender.email ??
                sender.phone ??
                t.senders.unavailable,
            },
            {
              id: "status",
              label: t.status,
              value: (sender) =>
                t.statuses[
                  sender.status ?? (sender.verified ? "ready" : "pending")
                ] ??
                sender.status ??
                "",
              render: (sender) => (
                <>
                  {sender.id === postalSetup?.sender?.id &&
                  postalSetup.senderVerification !== null &&
                  sender.status === "verified" ? (
                    <span className="status">
                      {postalSetup.senderVerification ===
                      "oauth_administrator_submission"
                        ? t.postalSetup.submittedInChat
                        : t.postalSetup.declared}
                    </span>
                  ) : (
                    <Status
                      status={
                        sender.status ?? (sender.verified ? "ready" : "pending")
                      }
                    />
                  )}
                  {sender.mode === "simulation" && (
                    <small className="sub-label">{t.simulation}</small>
                  )}
                </>
              ),
            },
          ]}
          filters={[
            {
              id: "channel",
              label: t.channel,
              value: (sender) => sender.channel,
              options: [
                ...new Set(resource.data.items.map((sender) => sender.channel)),
              ].map((channel) => ({
                value: channel,
                label: t.channels[channel],
              })),
            },
          ]}
        />
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
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [period, setPeriod] = useState("latest");
  const [knownPeriods, setKnownPeriods] = useState<string[]>([]);
  const [resolvedPeriod, setResolvedPeriod] = useState<string>();
  const resource = useResource<{
    items: UsageItem[];
    welcomeCredit?: WelcomeCredit;
    period?: string;
    currentPeriod?: string;
    availablePeriods?: string[];
  }>(`/usage?period=${period}`);
  useEffect(() => {
    if (resource.data?.availablePeriods)
      setKnownPeriods(resource.data.availablePeriods);
    if (resource.data?.period) setResolvedPeriod(resource.data.period);
  }, [resource.data?.availablePeriods, resource.data?.period]);
  const selectedPeriod =
    resource.data?.period ??
    (period === "latest" ? (resolvedPeriod ?? period) : period);
  const periods =
    resource.data?.availablePeriods ??
    (knownPeriods.length ? knownPeriods : [selectedPeriod]);
  const periodLabel = (value: string) =>
    value === "latest"
      ? t.usage.latest
      : new Intl.DateTimeFormat(formatLocale(), {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${value}-01T00:00:00Z`));
  return (
    <>
      <PageHeading
        title={t.usage.title}
        intro={t.usage.intro}
        action={
          <RefreshButton
            onClick={() => {
              resource.refresh();
              setRefreshVersion((version) => version + 1);
            }}
          />
        }
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.data?.welcomeCredit && (
        <CreditBalance credit={resource.data.welcomeCredit} />
      )}
      <UsageActivityCalendar refreshVersion={refreshVersion} />
      <h2>{t.usage.monthlyTitle}</h2>
      <Field label={t.usage.period} hint={t.usage.periodHint}>
        <select
          value={selectedPeriod}
          disabled={resource.loading}
          onChange={(event) => setPeriod(event.target.value)}
        >
          {periods.map((value) => (
            <option key={value} value={value}>
              {periodLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      {resource.loading && !resource.data ? (
        <Loading />
      ) : resource.error && !resource.data ? null : !resource.data?.items
          .length ? (
        <EmptyState title={t.usage.monthEmpty} />
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
          ? msg("PDF analysis is ready.")
          : msg(
              "The service is preparing PDF analysis. Wait a few minutes, then restart the analysis from your document.",
            ),
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
  // Filtered by the server across the whole organization, not one page.
  const incidentsPath = "/dispatches?group=attention";
  const dispatches = useResource<Page<Dispatch>>(incidentsPath);
  const incidents = dispatches.data?.items ?? [];
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
              {control.enabled ? (
                <ConfirmAction
                  disabled={controlAction.pending}
                  label={t.admin.pause}
                  ariaLabel={`${t.admin.pause} · ${t.channels[control.channel]}`}
                  question={t.admin.pauseQuestion}
                  confirmLabel={t.admin.pauseConfirm}
                  onConfirm={() => void setChannel(control.channel, false)}
                />
              ) : (
                <button
                  className="button small"
                  disabled={controlAction.pending}
                  onClick={() => void setChannel(control.channel, true)}
                >
                  {t.admin.resume}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {!isPublicPreview && (
        <section className="form-panel">
          <h2>{msg("Document analysis")}</h2>
          <p>
            {msg(
              "Prepare the service before importing your PDFs. Pending documents remain private until verification is complete.",
            )}
          </p>
          <button
            className="button"
            onClick={() => void warmScanner()}
            disabled={scannerAction.pending}
          >
            {scannerAction.pending
              ? msg("Preparing…")
              : msg("Prepare PDF analysis")}
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
        dispatches.data && <p className="empty-inline">{t.admin.noIncidents}</p>
      )}
      <LoadMore
        path={incidentsPath}
        data={dispatches.data}
        onLoaded={dispatches.setData}
      />
      <div className="notice warning">
        <WarningCircle size={24} />
        <p>{t.admin.note}</p>
      </div>
      <section className="dead-letters">
        <h2 className="section-title">{t.admin.deadLetters}</h2>
        {!!diagnostics.data?.deadLetters?.length && <DateTimezone />}
        {diagnostics.data?.deadLetters?.length ? (
          <DataTable
            label={t.admin.deadLetters}
            items={diagnostics.data.deadLetters}
            getRowKey={(receipt) => receipt.id}
            columns={[
              {
                id: "id",
                label: t.identifier,
                value: (receipt) => receipt.id,
                render: (receipt) => <code>{receipt.id}</code>,
              },
              {
                id: "queue",
                label: t.admin.queue,
                value: (receipt) => receipt.queue,
                render: (receipt) => <code>{receipt.queue}</code>,
              },
              {
                id: "created",
                label: t.created,
                value: (receipt) => tableTimestamp(receipt.received_at),
                searchValue: (receipt) => date(receipt.received_at),
                render: (receipt) => date(receipt.received_at),
                className: "date-cell",
              },
              {
                id: "actions",
                label: t.actions,
                value: () => "",
                sortable: false,
                render: (receipt) => (
                  <a
                    className="text-link"
                    href={`#/app/dispatch/${receipt.dispatch_id}`}
                  >
                    {t.admin.inspectJob}
                    <ArrowRight size={17} />
                  </a>
                ),
              },
            ]}
          />
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
