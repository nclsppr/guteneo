import { Field } from "./components";
import { useEffect, useId, useRef, useState } from "react";
import {
  FUTURE_SPENDING_ACKNOWLEDGEMENT,
  SCHEDULE_LIMITS,
  type DispatchScheduleStatus,
  type DispatchScheduleView,
} from "../../../packages/contracts/src/dispatch-schedules";
import {
  api,
  date,
  euroToMinor,
  EURO_INPUT_PATTERN,
  money,
  permissionsFor,
  recipientLabel,
  type DispatchDetail,
  type Page,
  type Session,
} from "./api";
import { DataTable, tableTimestamp } from "./data-table";
import {
  EmailPreview,
  EmptyState,
  ErrorNotice,
  go,
  Loading,
  LoadMore,
  PageHeading,
  PdfPreview,
  useAction,
  useRefreshOnFocus,
  useResource,
} from "./components";
import { RolePermissionNotice } from "./role-guide";
import { useAdaptiveReadPolling } from "./client-polling";
import { scheduleSourceSupported } from "./schedule-eligibility";
import { observeAuthorityRefusal } from "./client-authority-refusal";
import { msg } from "./messages";
import { formatLocale, t } from "./locale";
import "./lifecycle-pages.css";

// Approval must distinguish repeated local times when daylight saving ends.
function scheduledTime(value: string) {
  const instant = new Date(value);
  return Number.isFinite(instant.getTime())
    ? new Intl.DateTimeFormat(formatLocale(), {
        dateStyle: "medium",
        timeStyle: "long",
      }).format(instant)
    : t.unknown;
}

function statusLabel(status: DispatchScheduleStatus) {
  return {
    draft: msg("Waiting for approval"),
    approved: msg("Scheduled spending approved"),
    releasing: msg("Checking release conditions"),
    released: msg("Released for dispatch"),
    blocked: msg("Schedule blocked"),
    cancelled: msg("Schedule cancelled"),
    unknown: msg("Unknown outcome, review required"),
  }[status];
}

function scheduleProblem(code: string | null) {
  if (code === "SCHEDULE_CAP_EXCEEDED")
    return msg(
      "The fresh quote exceeds the approved cap. Prepare a new schedule to review a higher cap.",
    );
  if (code === "SCHEDULE_WINDOW_EXPIRED")
    return msg(
      "The approved release window has ended. Prepare a new schedule.",
    );
  if (
    code === "SCHEDULE_AUTHORITY_CHANGED" ||
    code === "SCHEDULE_AUTHORITY_REVOKED"
  )
    return msg(
      "The original authority changed. A new preparation and approval are required.",
    );
  return msg(
    "Release conditions could not be confirmed. Review the source dispatch and current permissions before preparing again.",
  );
}

export default function SchedulePages({
  route,
  session,
}: {
  route: string;
  session: Session;
}) {
  const path = route.split("?")[0] ?? "";
  if (path === "/app/schedules") return <ScheduleList />;
  if (path === "/app/schedules/new") {
    if (!permissionsFor(session).prepareDispatches)
      return <RolePermissionNotice />;
    const sourceId =
      new URLSearchParams(route.split("?")[1]).get("dispatch") ?? "";
    return (
      <CreateSchedule
        key={sourceId}
        sourceId={sourceId}
        previousId={new URLSearchParams(route.split("?")[1]).get("from") ?? ""}
      />
    );
  }
  return (
    <ScheduleDetail
      key={path}
      id={path.slice("/app/schedules/".length)}
      canApprove={permissionsFor(session).approveDispatches}
    />
  );
}

function ScheduleList() {
  const schedules = useResource<Page<DispatchScheduleView>>(
    "/dispatch-schedules?limit=100",
  );
  useRefreshOnFocus(schedules.refresh);
  return (
    <>
      <PageHeading
        title={msg("Scheduled dispatches")}
        intro={msg("Scheduling supports fax and message-only email.")}
        action={
          <a className="button subtle" href="#/app/dispatches">
            {msg("Prepare a dispatch first")}
          </a>
        }
      />
      <p className="field-hint">
        {msg("Funds and authority are checked at release.")}
      </p>
      <ErrorNotice error={schedules.error} retry={schedules.refresh} />
      {!schedules.data && schedules.loading && <Loading />}
      {schedules.data && (
        <DataTable
          viewId="schedules"
          label={msg("Scheduled dispatches")}
          items={schedules.data.items}
          getRowKey={(item) => item.id}
          empty={<EmptyState title={msg("No scheduled dispatches.")} />}
          filters={[
            {
              id: "status",
              label: msg("Status"),
              value: (item) => item.status,
              saveValue: true,
              options: (
                [
                  "draft",
                  "approved",
                  "releasing",
                  "released",
                  "blocked",
                  "cancelled",
                  "unknown",
                ] as const
              ).map((value) => ({ value, label: statusLabel(value) })),
            },
          ]}
          columns={[
            {
              id: "reference",
              label: msg("Dispatch"),
              value: (item) => item.id,
              render: (item) => (
                <a href={`#/app/schedules/${item.id}`}>{item.dispatchId}</a>
              ),
            },
            {
              id: "time",
              label: msg("Dispatch time"),
              value: (item) => tableTimestamp(item.executeAt),
              render: (item) => date(item.executeAt),
            },
            {
              id: "cap",
              label: msg("Spending cap") + msg(" excl. tax"),
              value: (item) => item.maxTotalMinor,
              render: (item) => money(item.maxTotalMinor),
            },
            {
              id: "status",
              label: msg("Status"),
              value: (item) => statusLabel(item.status),
            },
          ]}
        />
      )}
      <LoadMore
        path="/dispatch-schedules?limit=100"
        data={schedules.data}
        onLoaded={schedules.setData}
      />
    </>
  );
}

/** Reject browser-normalized nonexistent local times, including spring DST gaps. */
export function scheduleInstant(value: string): string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const local = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, "0")}-${String(instant.getDate()).padStart(2, "0")}T${String(instant.getHours()).padStart(2, "0")}:${String(instant.getMinutes()).padStart(2, "0")}`;
  return local === value ? instant.toISOString() : null;
}

function CreateSchedule({
  sourceId,
  previousId,
}: {
  sourceId: string;
  previousId: string;
}) {
  const id = useId();
  const [time, setTime] = useState("");
  const [cap, setCap] = useState("");
  const action = useAction(sourceId);
  const [refusal, setRefusal] = useState<Error>();
  const request = useRef<{ body: string; key: string } | undefined>(undefined);
  const source = useResource<DispatchDetail>(
    sourceId ? `/dispatches/${encodeURIComponent(sourceId)}` : null,
  );
  const previous = useResource<DispatchScheduleView>(
    previousId ? `/dispatch-schedules/${encodeURIComponent(previousId)}` : null,
  );
  const supported =
    !!source.data && scheduleSourceSupported(source.data.dispatch);
  const eligible =
    supported &&
    (source.data?.dispatch.status === "prepared" ||
      (previous.data?.dispatchId === sourceId &&
        previous.data.canReschedule &&
        !previous.error));
  const instant = scheduleInstant(time);
  if (refusal)
    return (
      <>
        <PageHeading title={msg("Scheduled dispatches")} />
        <ErrorNotice error={refusal} />
        <a href="#/app">{msg("Overview")}</a>
      </>
    );
  return (
    <>
      <PageHeading
        title={msg("New schedule")}
        intro={msg("Scheduling supports fax and message-only email.")}
      />
      <ErrorNotice error={source.error} retry={source.refresh} />
      {!sourceId && (
        <p className="notice info">
          <a href="#/app/dispatches">{msg("Prepare a dispatch first")}</a>
        </p>
      )}
      {source.loading && <Loading />}
      {source.data && !source.error && (
        <>
          <SourceReview detail={source.data} />
          {!supported && (
            <p className="notice info">
              {msg("Scheduling supports fax and message-only email.")}
            </p>
          )}
          <ErrorNotice error={previous.error} retry={previous.refresh} />
          <form
            className="form-panel panel lifecycle-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(async (view) => {
                const executeAt = scheduleInstant(time),
                  maxTotalMinor = euroToMinor(cap);
                if (
                  !eligible ||
                  !executeAt ||
                  !maxTotalMinor ||
                  maxTotalMinor > SCHEDULE_LIMITS.maximumMinor ||
                  Date.parse(executeAt) < Date.now() + 60_000 ||
                  Date.parse(executeAt) >
                    Date.now() + SCHEDULE_LIMITS.horizonDays * 86_400_000
                )
                  throw new Error(msg("The time or cap is invalid."));
                const body = { dispatchId: sourceId, executeAt, maxTotalMinor },
                  serialized = JSON.stringify(body);
                if (request.current?.body !== serialized)
                  request.current = {
                    body: serialized,
                    key: crypto.randomUUID(),
                  };
                const saved = await view.wait(
                  observeAuthorityRefusal(
                    api<DispatchScheduleView>("/dispatch-schedules", {
                      method: "POST",
                      key: request.current.key,
                      body,
                    }),
                    view,
                    setRefusal,
                  ),
                  (result) => ({
                    kind: "schedule_created",
                    resourceId: result.id,
                    route: `/app/schedules/${result.id}`,
                  }),
                );
                go(`/app/schedules/${saved.id}`);
              });
            }}
          >
            <fieldset disabled={action.pending || !eligible}>
              <Field label={msg("Dispatch time")}>
                <input
                  id={`${id}-time`}
                  type="datetime-local"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  required
                  aria-describedby={`${id}-zone`}
                />
              </Field>
              <p className="field-hint" id={`${id}-zone`}>
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
                {instant && (
                  <>
                    {" "}
                    · {date(instant)} · UTC {instant.slice(11, 16)}
                  </>
                )}
              </p>
              <Field label={msg("Maximum total cost in euros excluding tax")}>
                <input
                  id={`${id}-cap`}
                  inputMode="decimal"
                  pattern={EURO_INPUT_PATTERN}
                  value={cap}
                  onChange={(event) => setCap(event.target.value)}
                  required
                />
              </Field>
              <p className="field-hint">
                {msg(
                  "Choose a time from one minute to 30 days ahead. Acceptance into the dispatch queue is allowed for 15 minutes after that time. Delivery time depends on the provider. Creating this draft does not approve spending.",
                )}
              </p>
              <div className="actions">
                <button className="button" type="submit">
                  {action.pending ? t.loading : msg("Create schedule")}
                </button>
                <a className="button subtle" href="#/app/schedules">
                  {msg("Cancel")}
                </a>
              </div>
            </fieldset>
            <ErrorNotice error={action.error} />
          </form>
        </>
      )}
    </>
  );
}

function ScheduleDetail({
  id,
  canApprove,
}: {
  id: string;
  canApprove: boolean;
}) {
  const resource = useResource<DispatchScheduleView>(
    `/dispatch-schedules/${encodeURIComponent(id)}`,
  );
  useRefreshOnFocus(resource.refresh);
  useAdaptiveReadPolling(resource.refresh, {
    enabled: ["approved", "releasing"].includes(resource.data?.status ?? ""),
    scope: id,
    intervalMs: 4_000,
    loading: resource.loading,
    progress: `${resource.data?.revision}:${resource.data?.status}`,
  });
  return (
    <>
      <PageHeading
        title={msg("Scheduled dispatches")}
        action={
          <button
            className="button subtle"
            onClick={resource.refresh}
            disabled={resource.loading}
          >
            {msg("Refresh")}
          </button>
        }
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {!resource.data && resource.loading && <Loading />}
      {resource.data && (
        <ScheduleReview
          key={`${resource.data.id}:${resource.data.revision}:${resource.data.snapshotHash}`}
          schedule={resource.data}
          canApprove={canApprove}
          onSaved={resource.setData}
          onRefresh={resource.refresh}
        />
      )}
    </>
  );
}

function ScheduleReview({
  schedule,
  canApprove,
  onSaved,
  onRefresh,
}: {
  schedule: DispatchScheduleView;
  canApprove: boolean;
  onSaved: (value: DispatchScheduleView) => void;
  onRefresh: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [requested, setRequested] = useState(false);
  const action = useAction(
    `${schedule.id}:${schedule.revision}:${schedule.snapshotHash}`,
  );
  const [refusal, setRefusal] = useState<Error>();
  const [clock, setClock] = useState(Date.now);
  const deadline = Date.parse(schedule.releaseUntil);
  const approvalExpired = !Number.isFinite(deadline) || deadline <= clock;
  useEffect(() => {
    const wake = () => setClock(Date.now());
    const remaining = deadline - Date.now();
    const timer =
      remaining > 0
        ? window.setTimeout(wake, Math.min(remaining + 1, 2_147_483_647))
        : undefined;
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [deadline, clock]);
  const source = useResource<DispatchDetail>(
    `/dispatches/${encodeURIComponent(schedule.dispatchId)}`,
  );
  if (refusal)
    return (
      <>
        <ErrorNotice error={refusal} />
        <a href="#/app">{msg("Overview")}</a>
      </>
    );
  return (
    <>
      <section className="form-panel panel">
        <h2>{statusLabel(schedule.status)}</h2>
        <dl className="lifecycle-facts">
          <div>
            <dt>{msg("Dispatch time")}</dt>
            <dd>{scheduledTime(schedule.executeAt)}</dd>
          </div>
          <div>
            <dt>{msg("Release window")}</dt>
            <dd>
              {scheduledTime(schedule.executeAt)} –{" "}
              {scheduledTime(schedule.releaseUntil)}
            </dd>
          </div>
          <div>
            <dt>
              {msg("Spending cap")}
              {msg(" excl. tax")}
            </dt>
            <dd>{money(schedule.maxTotalMinor)}</dd>
          </div>
        </dl>
        <p>{msg("Funds and authority are checked at release.")}</p>
        {!schedule.releaseEnabled && (
          <p className="notice info">
            {msg("Automatic release is not enabled.")}
          </p>
        )}
        {schedule.status === "draft" && approvalExpired && (
          <p className="notice warning">
            {msg(
              "The approved release window has ended. Prepare a new schedule.",
            )}
          </p>
        )}
        {schedule.status === "blocked" && (
          <p className="notice warning">
            {scheduleProblem(schedule.errorCode)}
          </p>
        )}
        {schedule.status === "unknown" && (
          <p className="notice warning">
            {msg("Unknown outcome, review required")}
          </p>
        )}
        {schedule.releaseDispatchId && (
          <a
            className="button"
            href={`#/app/dispatch/${schedule.releaseDispatchId}`}
          >
            {msg("Open released dispatch")}
          </a>
        )}
      </section>
      <ErrorNotice error={source.error} retry={source.refresh} />
      {source.loading && !source.data && <Loading />}
      {source.data && !source.error && <SourceReview detail={source.data} />}
      {schedule.canReschedule && (
        <p>
          <a
            className="button"
            href={`#/app/schedules/new?dispatch=${encodeURIComponent(schedule.dispatchId)}&from=${encodeURIComponent(schedule.id)}`}
          >
            {msg("Create a new schedule for this frozen dispatch")}
          </a>
        </p>
      )}
      {schedule.status === "draft" && canApprove && (
        <section className="form-panel panel approval-panel lifecycle-form">
          <h2>{msg("Separate future approval")}</h2>
          <p>
            {msg(
              "Approval replaces immediate sending with this schedule. A fresh quote must fit the cap and release window. Cancelling this schedule does not restore the original prepared dispatch.",
            )}
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              disabled={
                action.pending ||
                !schedule.releaseEnabled ||
                approvalExpired ||
                !source.data ||
                !!source.error
              }
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>{msg(FUTURE_SPENDING_ACKNOWLEDGEMENT)}</span>
          </label>
          {schedule.channel === "email" && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={requested}
                disabled={
                  action.pending || !schedule.releaseEnabled || approvalExpired
                }
                onChange={(event) => setRequested(event.target.checked)}
              />
              <span>
                {msg("The recipient explicitly requested this email.")}
              </span>
            </label>
          )}
          <button
            type="button"
            className="button"
            disabled={
              action.pending ||
              !consent ||
              !schedule.releaseEnabled ||
              approvalExpired ||
              !source.data ||
              !!source.error ||
              (schedule.channel === "email" && !requested)
            }
            onClick={() =>
              void action.run(async (view) => {
                const saved = await view.wait(
                  observeAuthorityRefusal(
                    api<DispatchScheduleView>(
                      `/dispatch-schedules/${schedule.id}/approve`,
                      {
                        method: "POST",
                        body: {
                          expectedRevision: schedule.revision,
                          snapshotHash: schedule.snapshotHash,
                          acknowledgement: FUTURE_SPENDING_ACKNOWLEDGEMENT,
                          ...(schedule.channel === "email"
                            ? { recipientRequested: requested }
                            : {}),
                        },
                      },
                    ),
                    view,
                    setRefusal,
                  ),
                  (result) => ({
                    kind: "updated",
                    resourceId: result.id,
                    route: `/app/schedules/${result.id}`,
                  }),
                );
                onSaved(saved);
              })
            }
          >
            {action.pending ? t.loading : msg("Approve scheduled spending")}
          </button>
        </section>
      )}
      {schedule.status === "draft" && !canApprove && <RolePermissionNotice />}
      {["draft", "approved", "releasing", "unknown"].includes(
        schedule.status,
      ) && (
        <p>
          <button
            type="button"
            className="button subtle"
            disabled={action.pending}
            onClick={() => {
              if (
                !window.confirm(
                  msg(
                    "Cancel this schedule? An already accepted dispatch must be reviewed separately.",
                  ),
                )
              )
                return;
              void action.run(async (view) => {
                const saved = await view.wait(
                  observeAuthorityRefusal(
                    api<DispatchScheduleView>(
                      `/dispatch-schedules/${schedule.id}/cancel`,
                      {
                        method: "POST",
                        body: { expectedRevision: schedule.revision },
                      },
                    ),
                    view,
                    setRefusal,
                  ),
                  (result) => ({
                    kind: "updated",
                    resourceId: result.id,
                    route: `/app/schedules/${result.id}`,
                  }),
                );
                onSaved(saved);
              });
            }}
          >
            {msg("Cancel schedule")}
          </button>
        </p>
      )}
      <ErrorNotice error={action.error} retry={onRefresh} />
    </>
  );
}

function SourceReview({ detail }: { detail: DispatchDetail }) {
  const dispatch = detail.dispatch;
  return (
    <section className="form-panel panel">
      <h2>{msg("Frozen dispatch")}</h2>
      <dl className="lifecycle-facts">
        <div>
          <dt>{msg("Channel")}</dt>
          <dd>{t.channels[dispatch.channel]}</dd>
        </div>
        <div>
          <dt>{msg("Recipient")}</dt>
          <dd>{recipientLabel(dispatch)}</dd>
        </div>
        <div>
          <dt>{msg("Sender")}</dt>
          <dd>{dispatch.sender_address || t.unknown}</dd>
        </div>
        {dispatch.subject && (
          <div>
            <dt>{msg("Subject")}</dt>
            <dd>{dispatch.subject}</dd>
          </div>
        )}
      </dl>
      {dispatch.html ? (
        <EmailPreview html={dispatch.html} />
      ) : dispatch.text ? (
        <p className="lifecycle-message">{dispatch.text}</p>
      ) : null}
      {dispatch.document_id && (
        <PdfPreview
          id={dispatch.document_id}
          dispatchId={dispatch.id}
          stableViewport
        />
      )}
      <a href={`#/app/dispatch/${dispatch.id}`}>
        {msg("Open source dispatch")}
      </a>
    </section>
  );
}
