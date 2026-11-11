import { useRef, useState, type ReactNode } from "react";
import {
  ArrowSquareOut,
  ArrowUpRight,
  ClockCountdown,
  Plus,
  LockKey,
  PencilSimple,
  UsersThree,
  Coins,
  FileText,
  Database,
  Stack,
  GearSix,
  ShieldCheck,
} from "@phosphor-icons/react";
import { api, intentKey } from "../api/client";
import { useAction, usePages, useResource } from "../api/hooks";
import type { Channel, Usage } from "../api/types";
import { useReadySession, useWorkspace } from "../session";
import {
  useI18n,
  useT,
  localeNames,
  supportedLocales,
  intlLocale,
  type SupportedLocale,
} from "../i18n";
import { classicUrl } from "../config";
import { Link, useDirtyNavigation } from "../router";
import { sectionOf } from "../sections";
import {
  formatDateTime,
  formatMoney,
  destinationLines,
  shortRef,
} from "../format";
import {
  Dialog,
  Empty,
  ErrorNotice,
  Field,
  LoadMore,
  Notice,
  Sign,
  useAnnounce,
} from "../components/ui";
import {
  savedRecipientInput,
  type SavedRecipientView,
} from "../../../../packages/contracts/src/saved-recipients";
import type { DispatchScheduleView } from "../../../../packages/contracts/src/dispatch-schedules";
import type { TemplateView } from "../../../../packages/contracts/src/template-workflow";
import type { SecureDistributionView } from "../../../../packages/contracts/src/secure-distribution";
import { PINGEN_POSTAL_COUNTRY_CODES } from "../../../../packages/contracts/src/postal-destinations";
import {
  administrationRoutes,
  studioRoutes,
} from "../../../web/src/app-routes";
import "./workspaces.css";

function LoadingRows() {
  const t = useT();
  return (
    <div className="gare-loading" role="status" aria-label={t("state.loading")}>
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function WorkshopLink({
  path,
  children,
  primary = false,
}: {
  path: string;
  children: ReactNode;
  primary?: boolean;
}) {
  const t = useT();
  return (
    <a
      className={`button${primary ? " is-signal" : ""}`}
      href={classicUrl(path)}
      title={t("work.openWorkshop")}
    >
      {children}
      <ArrowSquareOut size={18} aria-hidden="true" />
    </a>
  );
}

function Status({ value }: { value: string }) {
  const t = useT();
  const label = t(`work.status.${value}`);
  return (
    <span
      className={`plate${["active", "published", "released", "approved"].includes(value) ? " is-ok" : ["failed", "blocked", "unknown", "revoked"].includes(value) ? " is-danger" : " is-quiet"}`}
    >
      {label === `work.status.${value}` ? t("work.status.unverified") : label}
    </span>
  );
}

function Unavailable() {
  const t = useT();
  return <Notice>{t("work.permission")}</Notice>;
}

/** Address-book reads and edits both require preparation permission. */
export function DestinationsPage() {
  const t = useT();
  const { permissions } = useWorkspace();
  const resource = usePages<SavedRecipientView>(
    permissions.prepareDispatches ? "/recipients?limit=30" : null,
  );
  const [editing, setEditing] = useState<SavedRecipientView | "new" | null>(
    null,
  );
  return (
    <>
      <Sign
        section={sectionOf("/destinations")}
        title={t("work.destinations")}
        also={t("work.addressBook")}
      >
        {permissions.prepareDispatches && (
          <button
            className="button is-signal"
            onClick={() => setEditing("new")}
          >
            <Plus size={18} aria-hidden="true" />
            {t("work.newContact")}
          </button>
        )}
      </Sign>
      {!permissions.prepareDispatches ? (
        <Unavailable />
      ) : (
        <>
          <ErrorNotice
            error={resource.error}
            retry={() => void resource.refresh()}
          />
          {resource.loading ? (
            <LoadingRows />
          ) : (
            !resource.error && (
              <div className="panel">
                {!resource.items.length ? (
                  <Empty title={t("work.noContacts")}>
                    <p>{t("work.contactsHelp")}</p>
                  </Empty>
                ) : (
                  <ul className="gare-directory">
                    {resource.items.map((item) => (
                      <li key={item.id}>
                        <div
                          className={`gare-line is-${item.channel}`}
                          aria-hidden="true"
                        >
                          <ArrowUpRight size={22} />
                        </div>
                        <div className="gare-directory-main">
                          <h2>{item.label}</h2>
                          <div className="gare-address">
                            {destinationLines({
                              recipient_json: item.recipient,
                            }).map((line, index) => (
                              <span key={index}>{line}</span>
                            ))}
                          </div>
                        </div>
                        <span className="caps">
                          {t(`work.channel.${item.channel}`)}
                        </span>
                        <button
                          className="button is-small"
                          onClick={() => setEditing(item)}
                          aria-label={t("work.editNamed", { name: item.label })}
                        >
                          <PencilSimple size={18} aria-hidden="true" />
                          {t("work.edit")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          )}
          <LoadMore
            visible={resource.hasMore}
            loading={resource.loadingMore}
            onClick={() => void resource.more()}
          />
        </>
      )}
      {editing && (
        <RecipientEditor
          entry={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void resource.refresh();
          }}
        />
      )}
    </>
  );
}

function RecipientEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry?: SavedRecipientView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const [label, setLabel] = useState(entry?.label ?? "");
  const [channel, setChannel] = useState<Channel>(entry?.channel ?? "email");
  const [phone, setPhone] = useState(
    entry?.channel === "fax" ? entry.recipient.phone : "",
  );
  const [email, setEmail] = useState(
    entry?.channel === "email" ? entry.recipient.email : "",
  );
  const originalPostal =
    entry?.channel === "postal" ? entry.recipient : undefined;
  const originalAddress = originalPostal
    ? "addressLines" in originalPostal
      ? originalPostal.addressLines.join("\n")
      : [
          originalPostal.name,
          originalPostal.line1,
          `${originalPostal.postalCode} ${originalPostal.city}`,
        ].join("\n")
    : "";
  const [address, setAddress] = useState(originalAddress);
  const [country, setCountry] = useState(originalPostal?.country ?? "FR");
  const [discard, setDiscard] = useState(false);
  const action = useAction();
  const request = useRef<{ body: string; key: string } | null>(null);
  const changed =
    label !== (entry?.label ?? "") ||
    channel !== (entry?.channel ?? "email") ||
    email !== (entry?.channel === "email" ? entry.recipient.email : "") ||
    phone !== (entry?.channel === "fax" ? entry.recipient.phone : "") ||
    address !== originalAddress ||
    country !== (originalPostal?.country ?? "FR");
  useDirtyNavigation(changed, t("work.discardQuestion"));
  const close = () => {
    if (action.pending) return;
    if (changed) setDiscard(true);
    else onClose();
  };
  const save = () =>
    void action.run(async () => {
      const recipient =
        channel === "email"
          ? { email }
          : channel === "fax"
            ? { phone }
            : originalPostal &&
                address === originalAddress &&
                country === originalPostal.country
              ? originalPostal
              : { country, addressLines: address.split(/\r?\n/) };
      const parsed = savedRecipientInput.safeParse({
        label,
        channel,
        recipient,
      });
      if (!parsed.success) throw new Error(t("work.checkContact"));
      const serialized = JSON.stringify(parsed.data);
      if (request.current?.body !== serialized)
        request.current = { body: serialized, key: intentKey() };
      await api<SavedRecipientView>(
        entry ? `/recipients/${encodeURIComponent(entry.id)}` : "/recipients",
        {
          method: entry ? "PATCH" : "POST",
          key: request.current.key,
          body: entry
            ? { expectedRevision: entry.revision, value: parsed.data }
            : parsed.data,
        },
      );
      onSaved();
    });
  return (
    <Dialog
      title={entry ? t("work.editContact") : t("work.newContact")}
      onClose={close}
    >
      {discard ? (
        <div className="stack">
          <p>{t("work.discardQuestion")}</p>
          <div className="cluster">
            <button className="button" onClick={() => setDiscard(false)}>
              {t("work.keepEditing")}
            </button>
            <button className="button is-danger" onClick={onClose}>
              {t("work.discard")}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <fieldset className="gare-fieldset stack" disabled={action.pending}>
            <Field label={t("work.contactLabel")}>
              <input
                required
                maxLength={160}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label={t("work.channel")}>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as Channel)}
              >
                {(["email", "fax", "postal"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`work.channel.${value}`)}
                  </option>
                ))}
              </select>
            </Field>
            {channel === "email" && (
              <Field label={t("work.email")}>
                <input
                  type="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            )}
            {channel === "fax" && (
              <Field label={t("work.phone")}>
                <input
                  type="tel"
                  required
                  maxLength={80}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="off"
                  placeholder="+352…"
                />
              </Field>
            )}
            {channel === "postal" && (
              <>
                <Field label={t("work.country")}>
                  <select
                    value={country}
                    onChange={(event) =>
                      setCountry(event.target.value as typeof country)
                    }
                  >
                    {PINGEN_POSTAL_COUNTRY_CODES.map((code) => (
                      <option key={code} value={code}>
                        {new Intl.DisplayNames(intlLocale(locale), {
                          type: "region",
                        }).of(code) ?? code}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("work.postalAddress")}>
                  <textarea
                    required
                    rows={5}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    maxLength={2000}
                  />
                </Field>
              </>
            )}
            <ErrorNotice error={action.error} />
            <div className="cluster">
              <button className="button is-signal" type="submit">
                {action.pending ? t("state.loading") : t("work.save")}
              </button>
              <button className="button" type="button" onClick={close}>
                {t("work.cancel")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </Dialog>
  );
}

/** Approval stays on the complete existing review; cancellation is revision-bound. */
export function TimetablePage() {
  const { t, locale } = useI18n();
  const { permissions, capabilities } = useWorkspace();
  const resource = usePages<DispatchScheduleView>(
    permissions.prepareDispatches ? "/dispatch-schedules?limit=30" : null,
    { every: 15000, ceiling: 60000 },
  );
  const [cancel, setCancel] = useState<DispatchScheduleView | null>(null);
  const action = useAction();
  const announce = useAnnounce();
  return (
    <>
      <Sign
        section={sectionOf("/timetable")}
        title={t("work.timetable")}
        also={t("work.scheduledDispatches")}
      />
      {!permissions.prepareDispatches ? (
        <Unavailable />
      ) : (
        <div className="stack">
          {capabilities?.scheduledDispatches?.enabled === false && (
            <Notice>{t("work.schedulingDisabled")}</Notice>
          )}
          <p className="muted">{t("work.timezone")}</p>
          <ErrorNotice
            error={resource.error}
            retry={() => void resource.refresh()}
          />
          {resource.loading ? (
            <LoadingRows />
          ) : (
            !resource.error && (
              <div className="panel">
                {!resource.items.length ? (
                  <Empty title={t("work.noSchedules")}>
                    <p>{t("work.schedulesHelp")}</p>
                    <Link className="button is-signal" href="/departures">
                      {t("work.viewDepartures")}
                    </Link>
                  </Empty>
                ) : (
                  <ul className="gare-directory">
                    {resource.items.map((item) => (
                      <li key={item.id}>
                        <div className="gare-line">
                          <ClockCountdown size={22} aria-hidden="true" />
                        </div>
                        <div className="gare-directory-main">
                          <h2>
                            <time dateTime={item.executeAt}>
                              {formatDateTime(item.executeAt, locale)}
                            </time>
                          </h2>
                          <p className="muted">
                            {t(`work.channel.${item.channel}`)} ·{" "}
                            {shortRef(item.dispatchId)} ·{" "}
                            {t("work.cap", {
                              amount: formatMoney(
                                item.maxTotalMinor,
                                locale,
                                item.currency,
                              ),
                            })}
                          </p>
                        </div>
                        <Status value={item.status} />
                        <div className="cluster">
                          <WorkshopLink
                            path={`/app/schedules/${encodeURIComponent(item.id)}`}
                          >
                            {t("work.reviewSchedule")}
                          </WorkshopLink>
                          {[
                            "draft",
                            "approved",
                            "releasing",
                            "unknown",
                          ].includes(item.status) && (
                            <button
                              className="button is-small"
                              onClick={() => {
                                action.clear();
                                setCancel(item);
                              }}
                            >
                              {t("work.cancel")}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          )}
          <LoadMore
            visible={resource.hasMore}
            loading={resource.loadingMore}
            onClick={() => void resource.more()}
          />
        </div>
      )}
      {cancel && (
        <Dialog
          title={t("work.cancelSchedule")}
          onClose={() => {
            if (!action.pending) setCancel(null);
          }}
        >
          <div className="stack">
            <p>{t("work.cancelScheduleHelp")}</p>
            <p className="data">
              {shortRef(cancel.dispatchId)} ·{" "}
              {formatDateTime(cancel.executeAt, locale)} UTC
            </p>
            <ErrorNotice error={action.error} />
            <div className="cluster">
              <button
                className="button is-danger"
                disabled={action.pending}
                onClick={() =>
                  void action.run(async () => {
                    await api(
                      `/dispatch-schedules/${encodeURIComponent(cancel.id)}/cancel`,
                      {
                        method: "POST",
                        body: { expectedRevision: cancel.revision },
                      },
                    );
                    setCancel(null);
                    announce(t("work.scheduleCancelled"));
                    await resource.refresh();
                  })
                }
              >
                {t("work.cancelSchedule")}
              </button>
              <button
                className="button"
                disabled={action.pending}
                onClick={() => setCancel(null)}
              >
                {t("work.keepSchedule")}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function StudioPage() {
  const { t, locale } = useI18n();
  const { permissions } = useWorkspace();
  const models = usePages<TemplateView>(
    permissions.prepareDispatches ? "/templates" : null,
  );
  return (
    <>
      <Sign
        section={sectionOf("/studio")}
        title={t("work.studio")}
        also={t("work.templatesAndData")}
      >
        {permissions.prepareDispatches && (
          <WorkshopLink primary path={`${studioRoutes.templates}?new=blank`}>
            {t("work.newTemplate")}
          </WorkshopLink>
        )}
      </Sign>
      {!permissions.prepareDispatches ? (
        <Unavailable />
      ) : (
        <div className="stack">
          <div className="gare-studio-tools">
            <WorkshopLink path={studioRoutes.datasets}>
              <Database size={20} aria-hidden="true" />
              {t("work.datasets")}
            </WorkshopLink>
            <WorkshopLink path={studioRoutes.generations}>
              <Stack size={20} aria-hidden="true" />
              {t("work.generations")}
            </WorkshopLink>
          </div>
          <ErrorNotice
            error={models.error}
            retry={() => void models.refresh()}
          />
          {models.loading ? (
            <LoadingRows />
          ) : (
            !models.error &&
            (!models.items.length ? (
              <Empty title={t("work.noTemplates")}>
                <p>{t("work.templatesHelp")}</p>
              </Empty>
            ) : (
              <div className="gare-template-grid">
                {models.items.map((item) => (
                  <article className="gare-template" key={item.id}>
                    <div className="gare-template-paper" aria-hidden="true">
                      <FileText size={56} weight="thin" />
                      <span className="data">
                        {String(item.currentVersion ?? item.revision).padStart(
                          2,
                          "0",
                        )}
                      </span>
                    </div>
                    <div className="stack-tight">
                      <Status value={item.state} />
                      <h2>{item.name}</h2>
                      {item.envelope.description && (
                        <p className="muted">{item.envelope.description}</p>
                      )}
                      <p className="gare-small muted">
                        {t("work.updated", {
                          date: formatDateTime(item.updatedAt, locale),
                        })}
                      </p>
                      <WorkshopLink
                        path={studioRoutes.template(
                          encodeURIComponent(item.id),
                        )}
                      >
                        {item.permissions.edit
                          ? t("work.editTemplate")
                          : t("work.openTemplate")}
                      </WorkshopLink>
                    </div>
                  </article>
                ))}
              </div>
            ))
          )}
          <LoadMore
            visible={models.hasMore}
            loading={models.loadingMore}
            onClick={() => void models.more()}
          />
        </div>
      )}
    </>
  );
}

type Member = {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  supervisorCanApprove: boolean;
  supervisorCanReport: boolean;
};

export function OfficePage() {
  const { t, locale } = useI18n();
  const { workspace, permissions } = useWorkspace();
  const canRead = permissions.manageOrganization || permissions.viewReports;
  const usage = useResource<Usage>(canRead ? "/usage" : null);
  const members = usePages<Member>(
    permissions.manageMembers ? "/admin/members" : null,
  );
  return (
    <>
      <Sign
        section={sectionOf("/office")}
        title={t("work.office")}
        also={workspace.organization.name}
      />
      {!canRead ? (
        <Unavailable />
      ) : (
        <div className="stack">
          <ErrorNotice error={usage.error} retry={() => void usage.refresh()} />
          {usage.loading ? (
            <LoadingRows />
          ) : (
            usage.data &&
            !usage.error && (
              <section
                className="gare-balance panel"
                aria-label={t("work.credit")}
              >
                <div>
                  <p className="caps">{t("work.availableCredit")}</p>
                  <p className="gare-balance-amount">
                    {formatMoney(
                      usage.data.welcomeCredit.availableMinor,
                      locale,
                      usage.data.welcomeCredit.currency,
                    )}
                  </p>
                  <p className="muted">{t("work.excludingTax")}</p>
                </div>
                <dl className="facts">
                  <div className="fact">
                    <dt>{t("work.reserved")}</dt>
                    <dd>
                      {formatMoney(
                        usage.data.welcomeCredit.reservedMinor,
                        locale,
                        usage.data.welcomeCredit.currency,
                      )}
                    </dd>
                  </div>
                  <div className="fact">
                    <dt>{t("work.spent")}</dt>
                    <dd>
                      {formatMoney(
                        usage.data.welcomeCredit.spentMinor,
                        locale,
                        usage.data.welcomeCredit.currency,
                      )}
                    </dd>
                  </div>
                </dl>
              </section>
            )
          )}
          <div className="gare-office-links">
            {permissions.viewReports && (
              <>
                <WorkshopLink path={administrationRoutes.activity}>
                  {t("work.activity")}
                </WorkshopLink>
                <WorkshopLink path={administrationRoutes.consumption}>
                  {t("work.consumption")}
                </WorkshopLink>
                <WorkshopLink path={administrationRoutes.reports}>
                  {t("work.reports")}
                </WorkshopLink>
              </>
            )}
            {permissions.manageBilling && (
              <WorkshopLink path={administrationRoutes.billing}>
                <Coins size={20} aria-hidden="true" />
                {t("work.billing")}
              </WorkshopLink>
            )}
            {permissions.manageMembers && (
              <WorkshopLink path={administrationRoutes.members}>
                <UsersThree size={20} aria-hidden="true" />
                {t("work.manageMembers")}
              </WorkshopLink>
            )}
            {permissions.manageOrganization && (
              <>
                <WorkshopLink path={administrationRoutes.settings}>
                  <GearSix size={20} aria-hidden="true" />
                  {t("work.settings")}
                </WorkshopLink>
                <WorkshopLink path={administrationRoutes.connections}>
                  {t("work.connections")}
                </WorkshopLink>
                <WorkshopLink path={administrationRoutes.webhooks}>
                  {t("work.webhooks")}
                </WorkshopLink>
                <WorkshopLink path={administrationRoutes.audit}>
                  {t("work.audit")}
                </WorkshopLink>
                <WorkshopLink path={administrationRoutes.operations}>
                  {t("work.operations")}
                </WorkshopLink>
                <WorkshopLink path="/app/senders">
                  {t("work.senders")}
                </WorkshopLink>
              </>
            )}
          </div>
          {permissions.manageMembers && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">{t("work.team")}</h2>
              </div>
              <ErrorNotice
                error={members.error}
                retry={() => void members.refresh()}
              />
              {members.loading ? (
                <LoadingRows />
              ) : (
                !members.error && (
                  <ul className="gare-directory">
                    {members.items.map((member) => (
                      <li key={member.id}>
                        <div className="gare-directory-main">
                          <h3>{member.name}</h3>
                          {member.email && (
                            <p className="muted">{member.email}</p>
                          )}
                        </div>
                        <span className="plate is-quiet">
                          {t(`work.role.${member.role}`)}
                        </span>
                        {(member.role === "admin" ||
                          member.supervisorCanApprove) && (
                          <span className="gare-small muted">
                            {t("work.canApprove")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )
              )}
              <LoadMore
                visible={members.hasMore}
                loading={members.loadingMore}
                onClick={() => void members.more()}
              />
            </section>
          )}
        </div>
      )}
    </>
  );
}

export function LockersPage() {
  const { t, locale } = useI18n();
  const { permissions, capabilities } = useWorkspace();
  const resource = usePages<SecureDistributionView>("/secure-distributions");
  return (
    <>
      <Sign
        section={sectionOf("/lockers")}
        title={t("work.lockers")}
        also={t("work.secureShares")}
      >
        {permissions.prepareDispatches &&
          capabilities?.secureDistribution?.available && (
            <WorkshopLink primary path="/app/secure-distributions/new">
              <Plus size={18} aria-hidden="true" />
              {t("work.newShare")}
            </WorkshopLink>
          )}
      </Sign>
      <div className="stack">
        <p className="muted">{t("work.revocationHelp")}</p>
        <ErrorNotice
          error={resource.error}
          retry={() => void resource.refresh()}
        />
        {resource.loading ? (
          <LoadingRows />
        ) : (
          !resource.error && (
            <div className="panel">
              {!resource.items.length ? (
                <Empty title={t("work.noShares")}>
                  <p>{t("work.sharesHelp")}</p>
                </Empty>
              ) : (
                <ul className="gare-directory">
                  {resource.items.map((item) => (
                    <li key={item.id}>
                      <div className="gare-line is-locker">
                        <LockKey size={22} aria-hidden="true" />
                      </div>
                      <div className="gare-directory-main">
                        <h2>{item.source.name}</h2>
                        <p>{item.recipient.name || item.recipient.address}</p>
                        {item.expiresAt && (
                          <p className="gare-small muted">
                            {t("work.availableUntil", {
                              date: formatDateTime(item.expiresAt, locale),
                            })}
                          </p>
                        )}
                      </div>
                      <Status value={item.status} />
                      <WorkshopLink
                        path={`/app/secure-distribution/${encodeURIComponent(item.id)}`}
                      >
                        {t("work.viewShare")}
                      </WorkshopLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        )}
        <LoadMore
          visible={resource.hasMore}
          loading={resource.loadingMore}
          onClick={() => void resource.more()}
        />
      </div>
    </>
  );
}

export function AccountPage() {
  const { t, locale, setLocale } = useI18n();
  const session = useReadySession();
  const user = session.personal?.user ?? session.workspace!.user;
  const [name, setName] = useState(user.name);
  const [language, setLanguage] = useState<SupportedLocale>(
    user.preferredLocale ?? locale,
  );
  const [workspaceName, setWorkspaceName] = useState("");
  const action = useAction();
  const announce = useAnnounce();
  const releaseNavigation = useDirtyNavigation(
    name.trim() !== user.name ||
      language !== (user.preferredLocale ?? locale) ||
      (!session.workspace && workspaceName.trim() !== ""),
    t("work.discardQuestion"),
  );
  return (
    <>
      <Sign title={t("work.account")} />
      <div className="gare-account-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">{t("work.identity")}</h2>
            <ShieldCheck size={24} aria-hidden="true" />
          </div>
          <div className="panel-body stack">
            <dl className="facts">
              <div className="fact">
                <dt>{t("work.name")}</dt>
                <dd>{user.name}</dd>
              </div>
              <div className="fact">
                <dt>{t("work.email")}</dt>
                <dd>{user.email || t("work.unavailable")}</dd>
              </div>
              {session.workspace && (
                <div className="fact">
                  <dt>{t("work.workspace")}</dt>
                  <dd>
                    {session.workspace.organization.name} ·{" "}
                    {t(`work.role.${session.workspace.user.role}`)}
                  </dd>
                </div>
              )}
            </dl>
            <p className="muted">{t("work.identityHelp")}</p>
            <WorkshopLink
              path={session.personal ? "/app/personal-account" : "/app/account"}
            >
              {t("work.accountSecurity")}
            </WorkshopLink>
          </div>
        </section>
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(session.personal ? "/personal/account" : "/account", {
                method: "PATCH",
                body: session.personal
                  ? { name: name.trim(), preferredLocale: language }
                  : { userName: name.trim(), preferredLocale: language },
              });
              await setLocale(language);
              await session.refresh();
              releaseNavigation();
              announce(t("work.profileSaved"));
            });
          }}
        >
          <div className="panel-head">
            <h2 className="panel-title">{t("work.preferences")}</h2>
          </div>
          <fieldset
            className="panel-body gare-fieldset stack"
            disabled={action.pending}
          >
            <Field label={t("work.name")}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={200}
                autoComplete="name"
              />
            </Field>
            <Field label={t("work.language")}>
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as SupportedLocale)
                }
              >
                {supportedLocales.map((value) => (
                  <option key={value} value={value}>
                    {localeNames[value]}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="button is-signal"
              disabled={
                name.trim() === user.name &&
                language === (user.preferredLocale ?? locale)
              }
            >
              {t("work.save")}
            </button>
            <ErrorNotice error={action.error} />
          </fieldset>
        </form>
        <section className="panel gare-workspaces">
          <div className="panel-head">
            <h2 className="panel-title">{t("work.workspaces")}</h2>
          </div>
          <div className="panel-body stack">
            {session.personal?.workspaces.map((workspace) => (
              <div className="gare-workspace-choice" key={workspace.id}>
                <div>
                  <strong>{workspace.name}</strong>
                  <p className="muted">{t(`work.role.${workspace.role}`)}</p>
                </div>
                <button
                  className="button"
                  disabled={workspace.current || action.pending}
                  onClick={() =>
                    void action.run(() => session.enterWorkspace(workspace.id))
                  }
                >
                  {workspace.current
                    ? t("work.current")
                    : t("work.switchWorkspace")}
                </button>
              </div>
            ))}
            {!session.workspace && session.personal && (
              <form
                className="cluster"
                onSubmit={(event) => {
                  event.preventDefault();
                  void action.run(() =>
                    session.createWorkspace(workspaceName.trim()),
                  );
                }}
              >
                <Field label={t("work.workspaceName")}>
                  <input
                    required
                    maxLength={160}
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                  />
                </Field>
                <button className="button is-signal" disabled={action.pending}>
                  {t("work.createWorkspace")}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
