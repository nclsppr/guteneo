import { DataTable, tableTimestamp } from "./data-table";
import { msg } from "./messages";
import { studioRoutes } from "./app-routes";
import { FileInput } from "./file-input";
import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  WarningCircle,
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
import { t } from "./locale";
import { ProtectedDocumentChoice } from "./protected-document";
import { EmailComposer } from "./email-composer";
import type { PostalSetup } from "../../../packages/contracts/src/postal-setup";
import { PostalSetupPanel } from "./postal-setup-panel";
import {
  ChannelLabel,
  DateTimezone,
  Definition,
  Disclosure,
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
    await action.run(async (view) => {
      const result = await view.wait(
        api<CsvResult>("/recipients/validate", {
          method: "POST",
          body: { csv },
        }),
      );
      setValidated(result);
      setValidatedCsv(csv);
    });
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await action.run(async (view) => {
      if (
        !validated ||
        validatedCsv !== csv ||
        !validated.rows.length ||
        validated.errors.length ||
        validated.duplicates.length
      )
        throw new Error(t.campaigns.noValidated);
      if (!campaignId.current) {
        const campaign = await view.wait(
          api<Campaign>("/campaigns", {
            method: "POST",
            body: { name },
            key: `campaign:${requestKey.current}`,
          }),
        );
        campaignId.current = campaign.id;
      }
      for (const row of validated.rows) {
        if (prepared.current.has(row.line)) continue;
        await view.wait(
          api<Dispatch>("/dispatches", {
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
          }),
          (receipt) => ({
            kind: "dispatch_prepared",
            resourceId: receipt.id,
            route: `/app/dispatch/${encodeURIComponent(receipt.id)}`,
          }),
        );
        prepared.current.add(row.line);
        setProgress(prepared.current.size);
      }
      go(`/app/campaign/${campaignId.current}`);
    });
  }
  const locked = !!campaignId.current;
  return (
    <>
      <PageHeading title={t.nav.campaigns} />
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
          <section className="form-panel campaign-step">
            <h2>
              <span aria-hidden="true">1</span> {t.campaigns.csv}
            </h2>
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
                    void action.run(async (view) => {
                      if (file.size > 1024 * 1024)
                        throw new Error(t.campaigns.tooLarge);
                      setCsv(await view.wait(file.text()));
                      setValidated(undefined);
                    });
                }}
              />
            </Field>
            <a
              className="campaign-example"
              download="guteneo-recipients.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(t.campaigns.sample)}`}
            >
              {msg("Download example")}
            </a>
            <Disclosure label={msg("Paste instead")}>
              <Field label={t.campaigns.csv}>
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
            </Disclosure>
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
                    viewId="campaign-validation"
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
                        saveValue: true,
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
          <section className="form-panel campaign-step">
            <h2>
              <span aria-hidden="true">2</span> {t.campaigns.document}
            </h2>
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
          </section>
          <section className="form-panel campaign-step campaign-review">
            <h2>
              <span aria-hidden="true">3</span> {msg("Review")}
            </h2>
            <dl className="campaign-review-summary">
              <Definition label={t.campaigns.valid}>
                {validated?.rows.length ?? 0}
              </Definition>
              <Definition label={t.document}>
                {documents.data?.items.find(
                  (document) => document.id === documentId,
                )?.name ?? t.dispatch.chooseDocument}
              </Definition>
            </dl>
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
          viewId="campaigns"
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
              saveValue: true,
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
        title={t.nav.senders}
        action={
          <RefreshButton
            onClick={() => {
              resource.refresh();
              setSetupRevision((revision) => revision + 1);
            }}
          />
        }
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data && <Loading />}
      <div className="sender-channel-grid">
        {(["email", "fax", "postal"] as const).map((channel) => {
          const senders =
            resource.data?.items.filter(
              (sender) => sender.channel === channel,
            ) ?? [];
          return (
            <section
              className="form-panel sender-channel"
              key={channel}
              aria-labelledby={`sender-channel-${channel}`}
            >
              <h2 id={`sender-channel-${channel}`}>
                <ChannelLabel channel={channel} />
              </h2>
              {resource.loading && !resource.data ? null : senders.length ? (
                <ul className="sender-profiles">
                  {senders.map((sender) => (
                    <li key={sender.id}>
                      <h3>{sender.name ?? t.channels[channel]}</h3>
                      <p className="sender-address">
                        {sender.address ??
                          sender.email ??
                          sender.phone ??
                          t.senders.unavailable}
                      </p>
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
                            sender.status ??
                            (sender.verified ? "ready" : "pending")
                          }
                        />
                      )}
                      {sender.mode === "simulation" && (
                        <small className="sub-label">{t.simulation}</small>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sender-empty">{t.senders.empty}</p>
              )}
              {channel === "postal" && (
                <PostalSetupPanel
                  key={setupRevision}
                  onUpdated={resource.refresh}
                  onStatus={setPostalSetup}
                  canManage={canManage}
                  canPrepare={canPrepare}
                />
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
