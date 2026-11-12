import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  EnvelopeSimple,
  Mailbox,
  Printer,
  Ticket,
} from "@phosphor-icons/react";
import {
  dispatchGroupNames,
  dispatchGroupOf,
  isDispatchGroup,
} from "../../../../packages/contracts/src/dispatch-groups";
import { api, ApiError, currentAuthority, intentKey } from "../api/client";
import { useAction, usePages, useResource } from "../api/hooks";
import type {
  Channel,
  Dispatch,
  DispatchDetail,
  DocumentRecord,
  Sender,
} from "../api/types";
import {
  Empty,
  ErrorNotice,
  Field,
  LoadMore,
  Notice,
  Sign,
} from "../components/ui";
import { SplitFlap } from "../components/split-flap";
import { boardText } from "../components/flap-engine";
import {
  boardStatus,
  boardTone,
  presentedStatus,
  statusLabel,
} from "../board-status";
import {
  Barcode,
  LineRoundel,
  Postmark,
  StationClock,
} from "../components/station-kit";
import { BrandStamp } from "../components/brand";
import { punchSound } from "../sound";
import { classicUrl } from "../config";
import {
  destinationLabel,
  destinationLines,
  dispatchFare,
  formatDateTime,
  formatMoney,
  formatTime,
  parseJson,
  shortRef,
  STATION_TIME_ZONE,
} from "../format";
import { useI18n } from "../i18n";
import {
  Link,
  navigate,
  useDirtyNavigation,
  withQuery,
  type Route,
} from "../router";
import { sections } from "../sections";
import { useWorkspace } from "../session";
import "./traffic.css";

const channelIcons = { fax: Printer, email: EnvelopeSimple, postal: Mailbox };
const section = (id: "departures" | "counter") =>
  sections.find((item) => item.id === id);

function Status({ dispatch }: { dispatch: Dispatch }) {
  const { t } = useI18n();
  const status = dispatch.activeSchedule ? "scheduled" : dispatch.status;
  return (
    <span className={`traffic-status is-${dispatchGroupOf(status) ?? "other"}`}>
      <span className="traffic-status-dot" aria-hidden="true" />
      {statusLabel(status, t, dispatch.channel)}
    </span>
  );
}

const BOARD_CELLS = { time: 5, destination: 20, status: 16, fare: 7 };

/** Dispatch lists contain authorized server rows only; a filter remounts pagination. */
export function DeparturesPage({ route }: { route: Route }) {
  const { t } = useI18n();
  const { permissions } = useWorkspace();
  const id = route.segments[1];
  const requested = route.query.get("group");
  const group = isDispatchGroup(requested) ? requested : undefined;
  if (id) return <DepartureDetail key={id} id={id} />;
  return (
    <div className="stack traffic-page">
      <Sign
        section={section("departures")}
        title={t("traffic.departures")}
        also={t("traffic.departures.also")}
      >
        {permissions.prepareDispatches && (
          <Link className="button is-signal" href="/counter">
            <Ticket size={18} aria-hidden="true" />
            {t("traffic.new")}
          </Link>
        )}
      </Sign>
      <nav className="tabs" aria-label={t("traffic.filter")}>
        {[undefined, ...dispatchGroupNames].map((item) => (
          <Link
            key={item ?? "all"}
            className={`tab${item === group ? " is-current" : ""}`}
            aria-current={item === group ? "page" : undefined}
            href={withQuery("/departures", { group: item })}
          >
            {t(`traffic.group.${item ?? "all"}`)}
          </Link>
        ))}
      </nav>
      <DepartureRows key={group ?? "all"} group={group} />
    </div>
  );
}

function DepartureRows({ group }: { group?: string }) {
  const { t, locale } = useI18n();
  const { permissions } = useWorkspace();
  // A complete board can refresh without replacing the reader’s cursor pages.
  const [moving, setMoving] = useState(false);
  const rows = usePages<Dispatch>(
    withQuery("/dispatches", { limit: "25", group }),
    moving ? { every: 4000 } : false,
  );
  const inMotion = rows.items.some(
    (item) => dispatchGroupOf(item.status) === "in_progress",
  );
  const paginated = Boolean(rows.data?.nextCursor);
  useEffect(() => setMoving(inMotion && !paginated), [inMotion, paginated]);
  return (
    <>
      <div className="traffic-board-heading">
        <span className="caps">{t("traffic.board")}</span>
        <button
          className="button is-small is-plain"
          type="button"
          onClick={() => void rows.refresh()}
          disabled={rows.loading}
        >
          <ArrowsClockwise size={17} aria-hidden="true" />
          {t("traffic.refresh")}
        </button>
      </div>
      <ErrorNotice error={rows.error} retry={rows.refresh} />
      {rows.loading ? (
        <div className="traffic-loading" role="status">
          {t("traffic.loading")}
        </div>
      ) : rows.items.length ? (
        <div className="board traffic-flapboard">
          <div className="board-head">
            <p className="board-title">
              {t("traffic.departures")}
              <span aria-hidden="true">{t("board.departures.languages")}</span>
            </p>
            <StationClock size="md" />
          </div>
          <table className="traffic-board" role="table">
            <caption className="visually-hidden">
              {t("traffic.board")} · {STATION_TIME_ZONE}
            </caption>
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  {t("traffic.time")}
                </th>
                <th scope="col" role="columnheader">
                  {t("traffic.line")}
                </th>
                <th scope="col" role="columnheader">
                  {t("traffic.destination")}
                </th>
                <th scope="col" role="columnheader">
                  {t("traffic.status")}
                </th>
                <th scope="col" role="columnheader">
                  {t("traffic.fare")}
                </th>
                <th scope="col" role="columnheader">
                  <span className="visually-hidden">{t("traffic.open")}</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {rows.items.map((dispatch, index) => {
                const status = presentedStatus(dispatch);
                const exact = statusLabel(status, t, dispatch.channel);
                const destination =
                  destinationLabel(dispatch) || t("traffic.unknownDestination");
                const fare = dispatchFare(dispatch, locale);
                const destinationFits =
                  [...boardText(destination)].length <= BOARD_CELLS.destination;
                const fareFits =
                  [...boardText(fare)].length <= BOARD_CELLS.fare;
                // Rows cascade once on arrival; later changes flip in place.
                const delay = Math.min(index, 12) * 55;
                return (
                  <tr key={dispatch.id} role="row">
                    <td role="cell" className="board-time">
                      <time
                        dateTime={dispatch.created_at}
                        title={formatDateTime(dispatch.created_at, locale)}
                      >
                        <span className="visually-hidden">
                          {formatDateTime(dispatch.created_at, locale)}
                        </span>
                        <SplitFlap
                          text={formatTime(dispatch.created_at, locale)}
                          cells={BOARD_CELLS.time}
                          delay={delay}
                        />
                      </time>
                      <small className="traffic-ref">
                        {shortRef(dispatch.id)}
                      </small>
                    </td>
                    <td role="cell" className="board-channel">
                      <LineRoundel line={dispatch.channel} />
                      <span>{t(`traffic.channel.${dispatch.channel}`)}</span>
                    </td>
                    <td role="cell" className="traffic-destination">
                      <Link
                        href={`/departures/${encodeURIComponent(dispatch.id)}`}
                        title={destination}
                      >
                        <span
                          className={
                            destinationFits
                              ? "visually-hidden"
                              : "board-full-destination"
                          }
                        >
                          {destination}
                        </span>
                        <SplitFlap
                          text={destination}
                          cells={BOARD_CELLS.destination}
                          delay={delay + 40}
                        />
                      </Link>
                      {dispatch.subject && <small>{dispatch.subject}</small>}
                      {dispatch.mode === "simulation" && (
                        <small className="traffic-simulation">
                          {t("traffic.simulation")}
                        </small>
                      )}
                    </td>
                    <td role="cell" className="board-state" title={exact}>
                      <span className="visually-hidden">{exact}</span>
                      <SplitFlap
                        text={boardStatus(status, t, dispatch.channel)}
                        cells={BOARD_CELLS.status}
                        tone={boardTone(status)}
                        delay={delay + 80}
                      />
                    </td>
                    <td role="cell" className="traffic-fare">
                      <span className={fareFits ? "visually-hidden" : "data"}>
                        {fare}
                      </span>
                      {fareFits && (
                        <SplitFlap
                          text={fare}
                          cells={BOARD_CELLS.fare}
                          align="end"
                          delay={delay + 120}
                        />
                      )}
                    </td>
                    <td role="cell">
                      <Link
                        className="traffic-open"
                        href={`/departures/${encodeURIComponent(dispatch.id)}`}
                        aria-label={`${t("traffic.open")} ${shortRef(dispatch.id)}`}
                      >
                        <ArrowRight size={20} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !rows.error && (
          <Empty title={t(group ? "traffic.empty.filtered" : "traffic.empty")}>
            {permissions.prepareDispatches && (
              <Link className="button is-signal" href="/counter">
                {t("traffic.new")}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
          </Empty>
        )
      )}
      <LoadMore
        visible={rows.hasMore}
        loading={rows.loadingMore}
        onClick={() => void rows.more()}
      />
      <p className="traffic-footnote">
        {t("traffic.timezone", { zone: STATION_TIME_ZONE })}
      </p>
    </>
  );
}

function DepartureDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const [refusal, setRefusal] = useState<Error>();
  // The outcome reader must retire the whole private resource on loss of
  // access, just as useResource does for its own reads. Remount only after
  // the person explicitly requests a fresh authorized read.
  if (refusal)
    return (
      <div className="stack">
        <Link className="link traffic-back" href="/departures">
          <ArrowLeft size={17} aria-hidden="true" />
          {t("traffic.departures")}
        </Link>
        <ErrorNotice error={refusal} retry={() => setRefusal(undefined)} />
      </div>
    );
  return <DepartureContent id={id} onAccessRefused={setRefusal} />;
}

function DepartureContent({
  id,
  onAccessRefused,
}: {
  id: string;
  onAccessRefused: (error: Error) => void;
}) {
  const { t, locale } = useI18n();
  const { permissions } = useWorkspace();
  const resource = useResource<DispatchDetail>(
    `/dispatches/${encodeURIComponent(id)}`,
  );
  const dispatch = resource.data?.dispatch;
  const active =
    dispatch &&
    [
      "accepted",
      "queued",
      "submitting",
      "submitted",
      "sending",
      "printed",
    ].includes(dispatch.status);
  // Detail polling is bounded and stops in the background or on a terminal outcome.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let interval = 3000;
    const tick = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      await resource.refresh();
      if (!stopped) {
        interval = Math.min(interval * 2, 30000);
        timer = setTimeout(tick, interval);
      }
    };
    const wake = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        interval = 3000;
        void tick();
      }
    };
    if (document.visibilityState !== "hidden")
      timer = setTimeout(tick, interval);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [active, resource.refresh]);
  const acceptance = resource.data?.events.find(
    (event) => event.kind === "accepted",
  );
  const hasAcceptance = resource.data ? Boolean(acceptance) : undefined;
  const previouslyAccepted = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (previouslyAccepted.current === false && hasAcceptance) punchSound();
    previouslyAccepted.current = hasAcceptance;
  }, [hasAcceptance]);
  if (!dispatch)
    return (
      <div className="stack">
        <Link className="link" href="/departures">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("traffic.departures")}
        </Link>
        {resource.loading ? (
          <p role="status">{t("traffic.loading")}</p>
        ) : (
          <ErrorNotice error={resource.error} retry={resource.refresh} />
        )}
      </div>
    );
  const canonical = classicUrl(
    `/app/dispatch/${encodeURIComponent(dispatch.id)}`,
  );
  const pending =
    ["prepared", "draft"].includes(dispatch.status) &&
    !dispatch.activeSchedule &&
    !resource.data?.activeSchedule;
  const unknown = ["submission_unknown", "reconciliation_required"].includes(
    dispatch.status,
  );
  const options = parseJson(dispatch.options_json);
  const textHtml = dispatch.text
    ? `<p>${dispatch.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`
    : "";
  // Native approval covers only the exact plain-text email variant shown here.
  // Custom HTML, documents and specialized options keep their existing review.
  const nativeEmail =
    dispatch.channel === "email" &&
    !dispatch.document_id &&
    Boolean(dispatch.text?.trim()) &&
    dispatch.html?.replaceAll("<br />", "<br>") === textHtml &&
    Object.keys(options).every(
      (name) => name === "replyTo" && typeof options.replyTo === "string",
    ) &&
    !dispatch.activeSchedule &&
    !resource.data?.activeSchedule;
  return (
    <div className="stack traffic-page">
      <Link className="link traffic-back" href="/departures">
        <ArrowLeft size={17} aria-hidden="true" />
        {t("traffic.departures")}
      </Link>
      <Sign
        section={section("departures")}
        title={t("traffic.ticket", { reference: shortRef(dispatch.id) })}
      >
        <button
          className="button"
          type="button"
          onClick={() => void resource.refresh()}
        >
          <ArrowsClockwise size={18} aria-hidden="true" />
          {t("traffic.refresh")}
        </button>
      </Sign>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {unknown && <Notice tone="danger">{t("traffic.unknownOutcome")}</Notice>}
      <div className="traffic-detail-grid">
        <article className="traffic-ticket">
          <header className="traffic-ticket-head">
            <span className="ticket-line">
              <LineRoundel line={dispatch.channel} size="lg" />
              <span>
                <span className="caps">
                  {t(`traffic.channel.${dispatch.channel}`)}
                </span>
                <span className="data">{shortRef(dispatch.id)}</span>
              </span>
            </span>
            <span className="ticket-franking" aria-hidden="true">
              <BrandStamp size={68} />
              {acceptance && (
                <Postmark
                  date={frankingDate(acceptance.occurred_at)}
                  place="gare · guteneo"
                />
              )}
            </span>
          </header>
          <div className="traffic-ticket-main">
            <p className="caps">{t("traffic.destination")}</p>
            <address>
              {destinationLines(dispatch).map((line, index) => (
                <span key={index}>{line}</span>
              ))}
            </address>
            <Status dispatch={dispatch} />
            {dispatch.mode === "simulation" && (
              <p className="traffic-ticket-simulation">
                {t("traffic.simulation.notice")}
              </p>
            )}
            <dl className="traffic-facts">
              <div>
                <dt>{t("traffic.fare")}</dt>
                <dd>
                  {dispatchFare(dispatch, locale)}
                  {dispatch.quote_pricing_basis ===
                    "public_list_price_ex_tax" && (
                    <small>{t("traffic.exTax")}</small>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("traffic.ceiling")}</dt>
                <dd>
                  {formatMoney(
                    dispatch.ceiling_minor,
                    locale,
                    dispatch.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("traffic.created")}</dt>
                <dd>{formatDateTime(dispatch.created_at, locale)}</dd>
              </div>
              {dispatch.sender_address && (
                <div>
                  <dt>{t("traffic.sender")}</dt>
                  <dd>{dispatch.sender_address}</dd>
                </div>
              )}
              {typeof options.replyTo === "string" && (
                <div>
                  <dt>{t("traffic.replyTo")}</dt>
                  <dd>{options.replyTo}</dd>
                </div>
              )}
              {dispatch.quote_expires_at && (
                <div>
                  <dt>{t("traffic.quoteExpiry")}</dt>
                  <dd>{formatDateTime(dispatch.quote_expires_at, locale)}</dd>
                </div>
              )}
            </dl>
            {dispatch.subject && (
              <div className="traffic-ticket-content">
                <p className="caps">{t("traffic.subject")}</p>
                <h2>{dispatch.subject}</h2>
              </div>
            )}
            {dispatch.text && (
              <p className="traffic-message">{dispatch.text}</p>
            )}
            {dispatch.document_id && (
              <Link
                className="button"
                href={`/documents?document=${encodeURIComponent(dispatch.document_id)}`}
              >
                {t("traffic.viewDocument")}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            )}
            {dispatch.channel === "postal" && (
              <p className="traffic-footnote">
                {[
                  options.printMode,
                  options.printSpectrum,
                  options.deliveryProduct,
                ]
                  .filter((value): value is string => typeof value === "string")
                  .map((value) => t(`traffic.option.${value}`))
                  .join(" · ")}
              </p>
            )}
          </div>
          <footer className="traffic-ticket-stub">
            <Barcode value={dispatch.fingerprint} />
            <span className="caps">{t("traffic.reference")}</span>
            <code>{dispatch.id}</code>
          </footer>
        </article>
        <div className="stack">
          {nativeEmail &&
          pending &&
          permissions.approveDispatches &&
          resource.data ? (
            <EmailReview
              key={`${dispatch.id}:${dispatch.fingerprint}`}
              detail={resource.data}
              update={resource.setData}
              onAccessRefused={onAccessRefused}
            />
          ) : (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">
                  {t(pending ? "traffic.review.title" : "traffic.manage.title")}
                </h2>
              </div>
              <div className="panel-body stack">
                <p>
                  {t(
                    pending
                      ? "traffic.review.description"
                      : "traffic.manage.description",
                  )}
                </p>
                {pending && !permissions.approveDispatches && (
                  <p className="muted">{t("traffic.review.approver")}</p>
                )}
                <a className="button is-signal" href={canonical}>
                  {t(pending ? "traffic.review.open" : "traffic.manage.open")}
                  <ArrowSquareOut size={18} aria-hidden="true" />
                </a>
                {(dispatch.activeSchedule || resource.data?.activeSchedule) && (
                  <Notice>{t("traffic.scheduleHold")}</Notice>
                )}
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">{t("traffic.timeline")}</h2>
            </div>
            <div className="panel-body">
              {resource.data?.events.length ? (
                <ol className="traffic-timeline">
                  {resource.data.events.map((event) => (
                    <li key={event.id}>
                      <span
                        className="traffic-timeline-dot"
                        aria-hidden="true"
                      />
                      <div>
                        <strong>
                          {statusLabel(event.kind, t, dispatch.channel)}
                        </strong>
                        <time dateTime={event.occurred_at}>
                          {formatDateTime(
                            event.occurred_at ?? event.received_at,
                            locale,
                          )}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">{t("traffic.noEvents")}</p>
              )}
            </div>
          </section>
          <p className="traffic-footnote">
            {t("traffic.deliveryMeaning")}{" "}
            {t("traffic.timezone", { zone: STATION_TIME_ZONE })}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmailReview({
  detail,
  update,
  onAccessRefused,
}: {
  detail: DispatchDetail;
  update: (detail: DispatchDetail) => void;
  onAccessRefused: (error: Error) => void;
}) {
  const { t, locale } = useI18n();
  const { capabilities } = useWorkspace();
  const dispatch = detail.dispatch;
  const [consent, setConsent] = useState(false);
  const [recipientRequested, setRecipientRequested] = useState(false);
  const [readRequired, setReadRequired] = useState(false);
  const [layoutMoved, setLayoutMoved] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const alive = useRef(true);
  const sending = useRef(false);
  const pointer = useRef<{ element: Element; x: number; y: number } | null>(
    null,
  );
  const action = useAction();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const expiry = Date.parse(dispatch.quote_expires_at ?? "");
    const wake = () => setClock(Date.now());
    const timer =
      Number.isFinite(expiry) && expiry > Date.now()
        ? setTimeout(wake, Math.min(expiry - Date.now() + 30, 2_147_483_647))
        : undefined;
    window.addEventListener("focus", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", wake);
    };
  }, [dispatch.quote_expires_at]);
  const production = dispatch.mode === "production";
  const expiry = Date.parse(dispatch.quote_expires_at ?? "");
  const exactPrice = production
    ? dispatch.currency === "EUR" &&
      Number.isSafeInteger(dispatch.quote_customer_nanoeur) &&
      (dispatch.quote_customer_nanoeur ?? -1) >= 0 &&
      Number.isFinite(expiry) &&
      expiry > clock
    : Number.isSafeInteger(dispatch.estimated_minor) &&
      dispatch.estimated_minor >= 0;
  const providerReady =
    !production ||
    capabilities?.channels.some(
      (channel) => channel.id === "email" && channel.liveSending,
    ) === true;
  const frozenReview =
    /^[a-f0-9]{64}$/.test(dispatch.fingerprint) &&
    Boolean(
      dispatch.sender_address && dispatch.subject && destinationLabel(dispatch),
    );
  const maySend =
    exactPrice &&
    providerReady &&
    frozenReview &&
    consent &&
    (!production || recipientRequested) &&
    !readRequired &&
    !action.pending;
  function currentView() {
    const epoch = currentAuthority();
    const route = window.location.pathname + window.location.search;
    return () =>
      alive.current &&
      epoch === currentAuthority() &&
      route === window.location.pathname + window.location.search;
  }
  async function readOutcome(isCurrent: () => boolean) {
    try {
      const latest = await api<DispatchDetail>(
        `/dispatches/${encodeURIComponent(dispatch.id)}`,
      );
      if (!isCurrent()) return;
      if (latest.dispatch.id !== dispatch.id)
        throw new Error(t("traffic.review.readFailed"));
      update(latest);
      setReadRequired(false);
    } catch (error) {
      if (
        isCurrent() &&
        error instanceof ApiError &&
        [401, 403, 404, 410].includes(error.status)
      )
        onAccessRefused(error);
      throw error;
    }
  }
  async function send() {
    if (sending.current || !maySend || (production && expiry <= Date.now()))
      return;
    sending.current = true;
    const isCurrent = currentView();
    setReadRequired(true);
    setConsent(false);
    await action.run(async () => {
      try {
        await api(`/dispatches/${encodeURIComponent(dispatch.id)}/approve`, {
          method: "POST",
          body: {
            fingerprint: dispatch.fingerprint,
            ...(production ? { recipientRequested } : {}),
          },
        });
        if (!isCurrent()) return;
        await api(`/dispatches/${encodeURIComponent(dispatch.id)}/confirm`, {
          method: "POST",
          key: `web-confirm:${dispatch.id}`,
          body: {},
        });
      } finally {
        // A lost response never triggers another write. Read the durable outcome.
        if (isCurrent()) await readOutcome(isCurrent);
      }
    });
    sending.current = false;
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t("traffic.review.native")}</h2>
      </div>
      <div
        className="panel-body stack"
        onPointerDownCapture={(event) => {
          const element = (event.target as Element).closest(
            "input,button,label",
          );
          const box = element?.getBoundingClientRect();
          pointer.current =
            element && box ? { element, x: box.left, y: box.top } : null;
        }}
        onClickCapture={(event) => {
          const previous = pointer.current;
          pointer.current = null;
          if (!previous || event.detail === 0) return;
          const box = previous.element.getBoundingClientRect();
          if (
            Math.abs(box.left - previous.x) > 1 ||
            Math.abs(box.top - previous.y) > 1
          ) {
            event.preventDefault();
            event.stopPropagation();
            setLayoutMoved(true);
          } else setLayoutMoved(false);
        }}
      >
        <p>{t("traffic.review.check")}</p>
        <ErrorNotice error={action.error} />
        {layoutMoved && <Notice>{t("traffic.review.layoutMoved")}</Notice>}
        {(!exactPrice || !frozenReview || !providerReady) && (
          <Notice tone="danger">{t("traffic.review.unavailable")}</Notice>
        )}
        {readRequired && !action.pending && (
          <Notice tone="danger">{t("traffic.review.interrupted")}</Notice>
        )}
        {action.pending && <p role="status">{t("traffic.review.sending")}</p>}
        {readRequired ? (
          <button
            className="button"
            type="button"
            disabled={action.pending}
            onClick={() => {
              const isCurrent = currentView();
              void action.run(() => readOutcome(isCurrent));
            }}
          >
            {t("traffic.review.checkStatus")}
          </button>
        ) : (
          <>
            <label className="traffic-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                disabled={action.pending || !exactPrice}
              />
              <span>
                {t("traffic.review.consent", {
                  price: dispatchFare(dispatch, locale),
                  ceiling: formatMoney(
                    dispatch.ceiling_minor,
                    locale,
                    dispatch.currency,
                  ),
                })}
              </span>
            </label>
            {production && (
              <label className="traffic-consent">
                <input
                  type="checkbox"
                  checked={recipientRequested}
                  onChange={(event) =>
                    setRecipientRequested(event.target.checked)
                  }
                  disabled={action.pending}
                />
                <span>{t("traffic.review.attestation")}</span>
              </label>
            )}
            <button
              className="button is-signal is-wide"
              type="button"
              disabled={!maySend}
              onClick={() => void send()}
            >
              {t(
                action.pending
                  ? "traffic.review.sending"
                  : production
                    ? "traffic.review.send"
                    : "traffic.review.simulate",
                { price: dispatchFare(dispatch, locale) },
              )}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </>
        )}
        {production && (
          <p className="traffic-footnote">{t("traffic.review.rounding")}</p>
        )}
      </div>
    </section>
  );
}

/** The date struck on a ticket: day.month.year in station time. */
function frankingDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10).split("-").reverse().join(".")
    : "";
}

/** Parse a EUR input directly into integer minor units, without float multiplication. */
function minorAmount(value: string): number | null {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function CounterPage({ route }: { route: Route }) {
  const { permissions, workspace } = useWorkspace();
  const { t } = useI18n();
  if (!permissions.prepareDispatches)
    return <Notice>{t("traffic.noPermission")}</Notice>;
  return (
    <CounterForm
      key={`${workspace.organization.id}:${workspace.user.id}:${route.query.toString()}`}
      route={route}
    />
  );
}

function CounterForm({ route }: { route: Route }) {
  const { t, locale } = useI18n();
  const { workspace, capabilities, simulation } = useWorkspace();
  const requestedChannel = route.query.get("channel");
  const [channel, setChannel] = useState<Channel>(
    requestedChannel === "fax" || requestedChannel === "postal"
      ? requestedChannel
      : "email",
  );
  const [documentId, setDocumentId] = useState(
    route.query.get("document") ?? "",
  );
  const [delivery, setDelivery] = useState<"message" | "attachment" | "secure">(
    route.query.get("document") ? "secure" : "message",
  );
  const [senderId, setSenderId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [budget, setBudget] = useState("5.00");
  const [dirty, setDirty] = useState(false);
  const releaseNavigation = useDirtyNavigation(dirty, t("traffic.discard"));
  const [validation, setValidation] = useState<Error>();
  const action = useAction();
  const key = useRef(intentKey());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const specialized =
    channel === "postal" || (channel === "email" && delivery === "secure");
  const needsDocument =
    channel === "fax" || (channel === "email" && delivery === "attachment");
  const documents = usePages<DocumentRecord>(
    needsDocument ? "/documents?limit=50" : null,
  );
  const selectedDocument = useResource<DocumentRecord>(
    needsDocument && documentId
      ? `/documents/${encodeURIComponent(documentId)}`
      : null,
  );
  const senders = useResource<{ items: Sender[] }>(
    specialized ? null : "/senders",
  );
  const matchingSenders =
    senders.data?.items.filter((sender) => sender.channel === channel) ?? [];
  const selectedSender =
    matchingSenders.find((sender) => sender.id === senderId) ??
    matchingSenders[0];
  const allDocuments = new Map(
    documents.items.map((document) => [document.id, document]),
  );
  if (selectedDocument.data)
    allDocuments.set(selectedDocument.data.id, selectedDocument.data);
  const readyDocuments = [...allDocuments.values()].filter(
    (document) => document.status === "ready",
  );
  const capability = capabilities?.channels.find(
    (candidate) => candidate.id === channel,
  );
  const canPrepare = Boolean(
    capabilities && (simulation || capability?.liveSending),
  );
  const canonicalPrepare = classicUrl(
    withQuery("/app/prepare", { channel, document: documentId || undefined }),
  );
  const changed = () => {
    setDirty(true);
    key.current = intentKey();
    action.clear();
    setValidation(undefined);
  };
  const switchChannel = (next: Channel) => {
    setChannel(next);
    setSenderId("");
    setRecipient("");
    changed();
  };
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.pending || specialized || !canPrepare) return;
    const ceilingMinor = minorAmount(budget);
    if (ceilingMinor === null) {
      setValidation(new Error(t("traffic.invalidBudget")));
      return;
    }
    if (
      needsDocument &&
      !readyDocuments.some((document) => document.id === documentId)
    ) {
      setValidation(new Error(t("traffic.invalidDocument")));
      return;
    }
    const phone = recipient.replace(/[\s().-]/g, "");
    if (channel === "fax" && !/^\+[1-9]\d{7,14}$/.test(phone)) {
      setValidation(new Error(t("traffic.invalidPhone")));
      return;
    }
    if (!simulation && !selectedSender) {
      setValidation(new Error(t("traffic.noSender")));
      return;
    }
    const authority = currentAuthority();
    const result = await action.run(() =>
      api<Dispatch>("/dispatches", {
        method: "POST",
        key: key.current,
        body: {
          channel,
          recipient:
            channel === "fax" ? { phone } : { email: recipient.trim() },
          ...(needsDocument ? { documentId } : {}),
          ...(selectedSender ? { senderId: selectedSender.id } : {}),
          ...(channel === "email"
            ? {
                subject,
                text: message,
                ...(delivery === "attachment"
                  ? { options: { emailDeliveryMode: "attachment" } }
                  : {}),
              }
            : {}),
          ceilingMinor,
        },
      }),
    );
    if (result?.id && alive.current && authority === currentAuthority()) {
      releaseNavigation();
      navigate(`/departures/${encodeURIComponent(result.id)}`);
    }
  }
  return (
    <div className="stack traffic-page">
      <Sign
        section={section("counter")}
        title={t("traffic.counter")}
        also={t("traffic.counter.also")}
      />
      <div
        className="traffic-channel-picker"
        role="group"
        aria-label={t("traffic.line")}
      >
        {(["email", "fax", "postal"] as const).map((item, index) => {
          const Icon = channelIcons[item];
          return (
            <button
              key={item}
              type="button"
              className={`traffic-channel is-${item}${channel === item ? " is-selected" : ""}`}
              aria-pressed={channel === item}
              onClick={() => switchChannel(item)}
              disabled={action.pending}
            >
              <span className="traffic-channel-number">0{index + 1}</span>
              <Icon size={27} aria-hidden="true" />
              <span>{t(`traffic.channel.${item}`)}</span>
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {channel === "email" && (
        <div className="traffic-delivery">
          <Field label={t("traffic.delivery")}>
            <select
              value={delivery}
              onChange={(event) => {
                setDelivery(event.target.value as typeof delivery);
                changed();
              }}
              disabled={action.pending}
            >
              <option value="message">{t("traffic.delivery.message")}</option>
              <option value="attachment">
                {t("traffic.delivery.attachment")}
              </option>
              <option value="secure">{t("traffic.delivery.secure")}</option>
            </select>
          </Field>
        </div>
      )}
      {specialized ? (
        <section className="panel traffic-specialist">
          <div className="panel-body stack">
            <p className="caps">
              {t(
                channel === "postal"
                  ? "traffic.postal.kicker"
                  : "traffic.secure.kicker",
              )}
            </p>
            <h2 className="traffic-specialist-title">
              {t(
                channel === "postal"
                  ? "traffic.postal.title"
                  : "traffic.secure.title",
              )}
            </h2>
            <p>
              {t(
                channel === "postal"
                  ? "traffic.postal.description"
                  : "traffic.secure.description",
              )}
            </p>
            <a className="button is-signal" href={canonicalPrepare}>
              {t(
                channel === "postal"
                  ? "traffic.postal.open"
                  : "traffic.secure.open",
              )}
              <ArrowSquareOut size={18} aria-hidden="true" />
            </a>
            <p className="traffic-footnote">{t("traffic.specialist.return")}</p>
          </div>
        </section>
      ) : (
        <div className="traffic-compose-grid">
          <form
            className="panel"
            onSubmit={(event) => void prepare(event)}
            aria-busy={action.pending}
          >
            <div className="panel-head">
              <h2 className="panel-title">{t("traffic.prepare.title")}</h2>
              <span className="caps">{t("traffic.step", { step: "01" })}</span>
            </div>
            <fieldset
              className="panel-body stack traffic-fieldset"
              disabled={action.pending}
              onChange={changed}
            >
              <legend className="visually-hidden">
                {t("traffic.prepare.title")}
              </legend>
              <ErrorNotice
                error={
                  validation ??
                  action.error ??
                  senders.error ??
                  documents.error ??
                  selectedDocument.error
                }
              />
              {!capabilities && (
                <Notice tone="danger">
                  {t("traffic.capabilityUnavailable")}
                </Notice>
              )}
              {capabilities && !canPrepare && (
                <Notice>{t("traffic.channelUnavailable")}</Notice>
              )}
              {simulation && <Notice>{t("traffic.simulation.notice")}</Notice>}
              <Field label={t("traffic.sender")}>
                <select
                  value={selectedSender?.id ?? ""}
                  onChange={(event) => setSenderId(event.target.value)}
                  required={!simulation}
                >
                  <option value="" disabled={Boolean(matchingSenders.length)}>
                    {t(
                      simulation ? "traffic.defaultSender" : "traffic.noSender",
                    )}
                  </option>
                  {matchingSenders.map((sender) => (
                    <option key={sender.id} value={sender.id}>
                      {sender.name ?? sender.address ?? sender.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t(channel === "fax" ? "traffic.phone" : "traffic.email")}
              >
                <input
                  type={channel === "fax" ? "tel" : "email"}
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  required
                  maxLength={320}
                  autoComplete={channel === "fax" ? "tel" : "email"}
                  placeholder={channel === "fax" ? "+352…" : "name@example.com"}
                />
              </Field>
              {channel === "fax" && (
                <p className="traffic-footnote">{t("traffic.phoneHint")}</p>
              )}
              {needsDocument && (
                <>
                  <Field label={t("traffic.document")}>
                    <select
                      value={documentId}
                      onChange={(event) => setDocumentId(event.target.value)}
                      required
                    >
                      <option value="">{t("traffic.chooseDocument")}</option>
                      {documentId &&
                        !readyDocuments.some(
                          (document) => document.id === documentId,
                        ) && (
                          <option value={documentId} disabled>
                            {t("traffic.invalidDocument")}
                          </option>
                        )}
                      {readyDocuments.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.name} · {document.pages}{" "}
                          {t("traffic.pages")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <LoadMore
                    visible={documents.hasMore}
                    loading={documents.loadingMore}
                    onClick={() => void documents.more()}
                  />
                  <Link className="link" href="/documents">
                    {t("traffic.import")}
                  </Link>
                  {channel === "email" && (
                    <Notice>{t("traffic.attachmentNotice")}</Notice>
                  )}
                </>
              )}
              {channel === "email" && (
                <>
                  <Field label={t("traffic.subject")}>
                    <input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      maxLength={200}
                      required
                    />
                  </Field>
                  <Field label={t("traffic.message")}>
                    <textarea
                      rows={8}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={100000}
                      required
                    />
                  </Field>
                </>
              )}
              <Field label={t("traffic.budget")}>
                <input
                  inputMode="decimal"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  pattern="[0-9]{1,9}([.,][0-9]{1,2})?"
                  required
                />
              </Field>
              <p className="traffic-footnote">{t("traffic.budgetHint")}</p>
              <button
                className="button is-signal is-wide"
                type="submit"
                disabled={
                  !canPrepare ||
                  action.pending ||
                  senders.loading ||
                  (!simulation && !selectedSender) ||
                  (needsDocument &&
                    (!documentId ||
                      !readyDocuments.some(
                        (document) => document.id === documentId,
                      )))
                }
              >
                {t(action.pending ? "traffic.preparing" : "traffic.prepare")}
                <ArrowRight size={19} aria-hidden="true" />
              </button>
              <p className="traffic-footnote">{t("traffic.prepareOnly")}</p>
            </fieldset>
          </form>
          <aside
            className="traffic-draft-ticket"
            aria-label={t("traffic.draftPreview")}
          >
            <header>
              <Ticket size={26} aria-hidden="true" />
              <span className="caps">{t("traffic.draft")}</span>
            </header>
            <div className="traffic-draft-body">
              <p className="caps">{t("traffic.from")}</p>
              <p className="traffic-draft-workspace">
                {workspace.organization.name}
              </p>
              <div className="traffic-journey-line" aria-hidden="true">
                <span />
                <ArrowRight size={24} />
              </div>
              <p className="caps">{t("traffic.destination")}</p>
              <p className="traffic-draft-destination">
                {recipient || t("traffic.destination.empty")}
              </p>
              <dl className="traffic-facts">
                <div>
                  <dt>{t("traffic.line")}</dt>
                  <dd>{t(`traffic.channel.${channel}`)}</dd>
                </div>
                <div>
                  <dt>{t("traffic.ceiling")}</dt>
                  <dd>
                    {minorAmount(budget) !== null
                      ? formatMoney(minorAmount(budget), locale)
                      : "…"}
                  </dd>
                </div>
              </dl>
            </div>
            <footer>{t("traffic.draftNotice")}</footer>
          </aside>
        </div>
      )}
    </div>
  );
}
