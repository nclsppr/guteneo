import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  DownloadSimple,
  FilePdf,
  UploadSimple,
} from "@phosphor-icons/react";
import type {
  PersonalDocumentItem,
  PersonalDocumentView,
} from "../../../../packages/contracts/src/secure-distribution";
import { documentAnalysis } from "../../../../packages/contracts/src/document-analysis";
import { api, apiBlob, ApiError, intentKey, isAbort } from "../api/client";
import { useAction, usePages, useResource } from "../api/hooks";
import type { DocumentRecord } from "../api/types";
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
import { classicUrl, signInUrl } from "../config";
import { formatBytes, formatDateTime } from "../format";
import { useI18n, useT } from "../i18n";
import { Link, navigate, useRoute } from "../router";
import { sections } from "../sections";
import { useReadySession, useWorkspace } from "../session";
import "./documents.css";

/** Private bytes live only in memory and are revoked on route/authority teardown. */
function usePrivateFile(path: string, type: "pdf" | "image") {
  const [state, setState] = useState<{
    path: string;
    url?: string;
    error?: Error;
  }>({ path });
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setState({ path });
    void apiBlob(path, { signal: controller.signal })
      .then(async (blob) => {
        const valid =
          type === "pdf"
            ? blob.type.split(";")[0] === "application/pdf" &&
              (await blob.slice(0, 5).text()) === "%PDF-"
            : ["image/png", "image/jpeg", "image/webp"].includes(
                blob.type.split(";")[0],
              );
        if (controller.signal.aborted) return;
        if (!valid) throw new ApiError("INVALID_DOCUMENT_CONTENT", "", 502);
        objectUrl = URL.createObjectURL(blob);
        setState({ path, url: objectUrl });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbort(error))
          setState({ path, error: error as Error });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, type]);
  return state.path === path ? state : { path };
}

function DocumentLoading() {
  const t = useT();
  return (
    <div className="document-loading" role="status">
      <span className="visually-hidden">{t("state.loading")}</span>
      <span />
      <span />
      <span />
    </div>
  );
}

function WorkspacePdf({ id, name }: { id: string; name: string }) {
  const t = useT();
  const file = usePrivateFile(
    `/documents/${encodeURIComponent(id)}/content`,
    "pdf",
  );
  return (
    <div className="stack">
      <ErrorNotice error={file.error} />
      {!file.url && !file.error && <DocumentLoading />}
      {file.url && (
        <>
          <iframe
            className="document-pdf"
            src={file.url}
            title={t("docs.previewTitle", { name })}
          />
          <a
            className="button"
            href={file.url}
            download={name}
            rel="noreferrer"
          >
            <DownloadSimple size={18} />
            {t("docs.download")}
          </a>
        </>
      )}
    </div>
  );
}

function WorkspaceDocument({ id }: { id: string }) {
  const { permissions } = useWorkspace();
  const { locale, t } = useI18n();
  const resource = useResource<DocumentRecord>(
    `/documents/${encodeURIComponent(id)}`,
    { every: 15000, ceiling: 60000 },
  );
  const action = useAction();
  const item = resource.data;
  const analysis = item
    ? (item.analysis ?? documentAnalysis(item.status))
    : undefined;
  return (
    <section className="panel document-detail" aria-label={t("docs.details")}>
      <div className="panel-head">
        <h2 className="panel-title">{item?.name ?? t("docs.details")}</h2>
        <Link className="button is-small" href="/documents">
          {t("action.close")}
        </Link>
      </div>
      <div className="panel-body stack">
        <ErrorNotice
          error={resource.error}
          retry={() => void resource.refresh()}
        />
        <ErrorNotice error={action.error} />
        {resource.loading && <DocumentLoading />}
        {item && !resource.error && (
          <>
            <Notice
              tone={
                analysis?.state === "ready"
                  ? "ok"
                  : analysis?.state === "blocked"
                    ? "danger"
                    : "info"
              }
            >
              {t(`docs.analysis.${analysis?.state ?? "retryable"}`)}
            </Notice>
            {permissions.prepareDispatches &&
              analysis?.nextAction === "rescan" && (
                <button
                  className="button"
                  disabled={action.pending}
                  onClick={() =>
                    void action.run(async () => {
                      await api(`/documents/${encodeURIComponent(id)}/rescan`, {
                        method: "POST",
                        body: {},
                      });
                      await resource.refresh();
                    })
                  }
                >
                  {action.pending ? t("state.loading") : t("docs.rescan")}
                </button>
              )}
            {item.status === "ready" && (
              <WorkspacePdf id={id} name={item.name} />
            )}
            <dl className="facts document-facts">
              <div className="fact">
                <dt>{t("docs.pages")}</dt>
                <dd>
                  {item.status === "ready" ? item.pages : t("docs.unverified")}
                </dd>
              </div>
              <div className="fact">
                <dt>{t("docs.size")}</dt>
                <dd>{formatBytes(item.size, locale)}</dd>
              </div>
              <div className="fact">
                <dt>{t("docs.created")}</dt>
                <dd>{formatDateTime(item.created_at, locale)} UTC</dd>
              </div>
              <div className="fact document-hash">
                <dt>SHA-256</dt>
                <dd>{item.sha256}</dd>
              </div>
            </dl>
            <div className="cluster">
              {permissions.prepareDispatches && item.status === "ready" && (
                <Link
                  className="button is-signal"
                  href={`/counter?document=${encodeURIComponent(id)}`}
                >
                  {t("docs.prepare")}
                  <ArrowRight size={18} />
                </Link>
              )}
              <a
                className="button"
                href={classicUrl(
                  `/app/documents?document=${encodeURIComponent(id)}`,
                )}
              >
                {t("docs.advancedChecks")}
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Workspace originals stay distinct from the recipient's personal documents. */
export function DocumentsPage() {
  const { permissions, capabilities } = useWorkspace();
  const { locale, t } = useI18n();
  const route = useRoute();
  const selected = route.query.get("document") ?? route.segments[1];
  const resource = usePages<DocumentRecord>("/documents?limit=25");
  const action = useAction();
  const announce = useAnnounce();
  const [form, setForm] = useState<"import" | "render" | null>(null);
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const chosen = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function close() {
    if (action.pending) return;
    if (dirty) setDiscard(true);
    else setForm(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      let result: DocumentRecord;
      if (form === "import") {
        const file = chosen.current?.files?.[0];
        if (!file) return;
        const body = new FormData();
        body.append("file", file);
        result = await api<DocumentRecord>("/documents", {
          method: "POST",
          body,
        });
      } else {
        result = await api<DocumentRecord>("/documents/render", {
          method: "POST",
          body: { name: name.trim(), html },
        });
      }
      if (!alive.current) return;
      setDirty(false);
      setForm(null);
      setName("");
      setHtml("");
      announce(t("docs.saved"));
      navigate(`/documents?document=${encodeURIComponent(result.id)}`);
      await resource.refresh();
    });
  }
  return (
    <>
      <Sign
        section={sections.find((section) => section.id === "documents")}
        title={t("docs.title")}
        also="DOCUMENTS / DOKUMENTE"
      >
        {permissions.prepareDispatches && (
          <div className="cluster">
            {capabilities?.documents.import !== false && (
              <button
                className="button is-signal"
                onClick={() => {
                  action.clear();
                  setForm("import");
                }}
              >
                <UploadSimple size={18} />
                {t("docs.import")}
              </button>
            )}
            {capabilities?.documents.render !== false && (
              <button
                className="button"
                onClick={() => {
                  action.clear();
                  setForm("render");
                }}
              >
                {t("docs.render")}
              </button>
            )}
          </div>
        )}
      </Sign>
      <p className="muted document-intro">{t("docs.intro")}</p>
      {selected ? (
        <WorkspaceDocument key={selected} id={selected} />
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">{t("docs.library")}</h2>
            <button
              className="button is-small"
              onClick={() => void resource.refresh()}
            >
              {t("docs.refresh")}
            </button>
          </div>
          <ErrorNotice
            error={resource.error}
            retry={() => void resource.refresh()}
          />
          {resource.loading && <DocumentLoading />}
          {!resource.loading && !resource.error && !resource.items.length && (
            <Empty title={t("docs.empty")}>
              <p>{t("docs.emptyBody")}</p>
            </Empty>
          )}
          <ul className="document-list">
            {resource.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/documents?document=${encodeURIComponent(item.id)}`}
                  className="document-row"
                >
                  <span className="document-symbol" aria-hidden="true">
                    <FilePdf size={28} />
                  </span>
                  <span className="document-row-main">
                    <strong>{item.name}</strong>
                    <span className="muted">
                      {formatBytes(item.size, locale)} ·{" "}
                      {formatDateTime(item.created_at, locale)} UTC
                    </span>
                  </span>
                  <span
                    className={`plate ${item.status === "ready" ? "is-ok" : "is-quiet"}`}
                  >
                    {t(
                      `docs.analysis.${item.analysis?.state ?? documentAnalysis(item.status).state}`,
                    )}
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <LoadMore
            visible={resource.hasMore}
            loading={resource.loadingMore}
            onClick={() => void resource.more()}
          />
        </section>
      )}
      {form && (
        <Dialog
          title={t(form === "import" ? "docs.import" : "docs.render")}
          onClose={close}
          wide={form === "render"}
        >
          <form onSubmit={(event) => void save(event)} className="stack">
            <ErrorNotice error={action.error} />
            {form === "import" ? (
              <Field label={t("docs.pdfFile")}>
                <input
                  ref={chosen}
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  onChange={() => setDirty(true)}
                  disabled={action.pending}
                />
              </Field>
            ) : (
              <>
                <Field label={t("docs.name")}>
                  <input
                    value={name}
                    maxLength={180}
                    required
                    onChange={(event) => {
                      setName(event.target.value);
                      setDirty(true);
                    }}
                    disabled={action.pending}
                  />
                </Field>
                <Field label={t("docs.html")}>
                  <textarea
                    className="document-source"
                    value={html}
                    required
                    onChange={(event) => {
                      setHtml(event.target.value);
                      setDirty(true);
                    }}
                    rows={12}
                    spellCheck={false}
                    disabled={action.pending}
                  />
                </Field>
              </>
            )}
            <p className="muted">{t("docs.saveNotice")}</p>
            <button
              className="button is-signal"
              type="submit"
              disabled={action.pending}
            >
              {action.pending
                ? t("docs.saving")
                : t(form === "import" ? "docs.import" : "docs.render")}
            </button>
          </form>
        </Dialog>
      )}
      {discard && (
        <Dialog
          title={t("docs.discardTitle")}
          onClose={() => setDiscard(false)}
          foot={
            <>
              <button className="button" onClick={() => setDiscard(false)}>
                {t("docs.keepEditing")}
              </button>
              <button
                className="button is-danger"
                onClick={() => {
                  setDirty(false);
                  setDiscard(false);
                  setForm(null);
                }}
              >
                {t("docs.discard")}
              </button>
            </>
          }
        >
          <p>{t("docs.discardBody")}</p>
        </Dialog>
      )}
    </>
  );
}

function SecurePage({
  id,
  number,
  title,
  textMode,
  onFailure,
}: {
  id: string;
  number: number;
  title: string;
  textMode: boolean;
  onFailure: (error: Error) => void;
}) {
  const t = useT();
  const path = `/personal/documents/${encodeURIComponent(id)}/pages/${number}`;
  const content = useResource<{ text: string }>(
    textMode ? `${path}/text` : null,
  );
  const [displayed, setDisplayed] = useState(false);
  const [visible, setVisible] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    let intersects = false;
    const synchronizeVisibility = () =>
      setVisible(intersects && document.visibilityState === "visible");
    const observer = new IntersectionObserver((entries) => {
      const latest = entries.at(-1);
      if (latest) intersects = latest.isIntersecting;
      synchronizeVisibility();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", synchronizeVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", synchronizeVisibility);
    };
  }, []);
  useEffect(() => {
    if (content.error) onFailure(content.error);
  }, [content.error, onFailure]);
  useEffect(() => {
    if (
      !visible ||
      document.visibilityState !== "visible" ||
      (!displayed && content.data?.text === undefined) ||
      reported.current
    )
      return;
    reported.current = true;
    const controller = new AbortController();
    void api(`/personal/documents/${encodeURIComponent(id)}/events`, {
      method: "POST",
      body: { type: "page_displayed", page: number },
      signal: controller.signal,
    }).catch((error: unknown) => {
      if (
        !isAbort(error) &&
        error instanceof ApiError &&
        [401, 403, 404, 410].includes(error.status)
      )
        onFailure(error);
    });
    return () => controller.abort();
  }, [visible, displayed, content.data, id, number, onFailure]);
  return (
    <div ref={surface}>
      {textMode ? (
        <>
          <ErrorNotice error={content.error} />
          {content.loading && <DocumentLoading />}
          {content.data && (
            <pre className="document-accessible-text">
              {content.data.text || t("arrivals.noText")}
            </pre>
          )}
        </>
      ) : (
        <SecureImage
          path={path}
          title={title}
          number={number}
          onDisplay={() => setDisplayed(true)}
          onFailure={onFailure}
        />
      )}
    </div>
  );
}

function SecureImage({
  path,
  title,
  number,
  onDisplay,
  onFailure,
}: {
  path: string;
  title: string;
  number: number;
  onDisplay: () => void;
  onFailure: (error: Error) => void;
}) {
  const t = useT();
  const image = usePrivateFile(path, "image");
  useEffect(() => {
    if (image.error) onFailure(image.error);
  }, [image.error, onFailure]);
  return (
    <>
      <ErrorNotice error={image.error} />
      {!image.error && !image.url && <DocumentLoading />}
      {image.url && (
        <img
          className="document-page-image"
          src={image.url}
          alt={t("arrivals.pageAlt", { title, page: number })}
          onLoad={onDisplay}
        />
      )}
    </>
  );
}

function ArrivalReader({
  id,
  kind,
}: {
  id: string;
  kind: "shared" | "personal";
}) {
  const { personal } = useReadySession();
  const { t, locale } = useI18n();
  const resource = useResource<PersonalDocumentView>(
    personal ? `/personal/documents/${encodeURIComponent(id)}` : null,
    { every: 30000, ceiling: 60000 },
  );
  const action = useAction();
  const [page, setPage] = useState(0);
  const [textMode, setTextMode] = useState(false);
  const [contentError, setContentError] = useState<Error>();
  const [depositState, setDepositState] = useState<"preparing" | "saved">();
  const depositKey = useRef(intentKey());
  const downloadUrls = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const urls = downloadUrls.current;
    return () => {
      alive.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);
  const item = resource.error || contentError ? undefined : resource.data;
  const selectedPage = item?.pages[page];
  const back = kind === "personal" ? "/arrivals?kind=personal" : "/arrivals";
  const issue = contentError ?? resource.error ?? action.error;
  const authenticationIssue =
    issue instanceof ApiError && [401, 403].includes(issue.status);
  useEffect(() => {
    if (
      action.error instanceof ApiError &&
      [401, 403, 404, 410].includes(action.error.status)
    )
      setContentError(action.error);
  }, [action.error]);
  async function download() {
    await action.run(async () => {
      const blob = await apiBlob(
        `/personal/documents/${encodeURIComponent(id)}/download`,
        { method: "POST", body: {}, key: intentKey() },
      );
      if (!alive.current) return;
      if (
        blob.type.split(";")[0] !== "application/pdf" ||
        (await blob.slice(0, 5).text()) !== "%PDF-"
      )
        throw new ApiError("INVALID_DOCUMENT_CONTENT", "", 502);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      downloadUrls.current.add(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item?.title ?? "document.pdf";
      anchor.rel = "noreferrer";
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 30000);
    });
  }
  async function deposit() {
    await action.run(async () => {
      const result = await api<{
        id: string;
        status: string;
        expiresAt: string;
      }>(`/personal/documents/${encodeURIComponent(id)}/deposit`, {
        method: "POST",
        body: {},
        key: depositKey.current,
      });
      if (!alive.current) return;
      setDepositState(result.status === "active" ? "saved" : "preparing");
      await resource.refresh();
    });
  }
  return (
    <div className="stack">
      <Link className="button" href={back}>
        <ArrowLeft size={18} />
        {t("arrivals.back")}
      </Link>
      <ErrorNotice
        error={issue}
        retry={() => {
          setContentError(undefined);
          void resource.refresh();
        }}
      />
      {authenticationIssue && (
        <a
          className="button is-signal"
          href={signInUrl(
            `/arrivals?document=${encodeURIComponent(id)}`,
            locale,
            { fresh: true },
          )}
        >
          {t("arrivals.verify")}
        </a>
      )}
      {resource.loading && <DocumentLoading />}
      {item && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">{item.title}</h2>
            <span className="plate">{t(`arrivals.status.${item.status}`)}</span>
          </div>
          <div className="panel-body stack">
            <dl className="facts document-facts">
              <div className="fact">
                <dt>{t("arrivals.sender")}</dt>
                <dd>{item.sender}</dd>
              </div>
              <div className="fact">
                <dt>
                  {t(
                    kind === "personal"
                      ? "arrivals.retainedUntil"
                      : "arrivals.availableUntil",
                  )}
                </dt>
                <dd>{formatDateTime(item.expiresAt, locale)} UTC</dd>
              </div>
            </dl>
            {item.status === "pending" && (
              <Notice>{t("arrivals.pending")}</Notice>
            )}
            {item.status === "active" && (
              <>
                {item.kind === "shared" && (
                  <p className="muted">{t("arrivals.auditNotice")}</p>
                )}
                <div className="cluster document-reader-toolbar">
                  <button
                    className="button is-small"
                    disabled={page <= 0}
                    onClick={() => setPage((n) => Math.max(0, n - 1))}
                  >
                    {t("arrivals.previous")}
                  </button>
                  <span className="data" aria-live="polite">
                    {t("arrivals.pageOf", {
                      page: Math.min(page + 1, item.pages.length),
                      total: item.pages.length,
                    })}
                  </span>
                  <button
                    className="button is-small"
                    disabled={page >= item.pages.length - 1}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    {t("arrivals.next")}
                  </button>
                  <button
                    className="button is-small"
                    aria-pressed={textMode}
                    onClick={() => setTextMode((value) => !value)}
                  >
                    {t(textMode ? "arrivals.image" : "arrivals.text")}
                  </button>
                </div>
                {selectedPage && (
                  <SecurePage
                    key={`${id}:${selectedPage.number}:${textMode}`}
                    id={id}
                    number={selectedPage.number}
                    title={item.title}
                    textMode={textMode}
                    onFailure={setContentError}
                  />
                )}
                <div className="cluster">
                  {(item.kind === "personal" || item.allowOriginalDownload) && (
                    <button
                      className="button"
                      disabled={action.pending}
                      onClick={() => void download()}
                    >
                      <DownloadSimple size={18} />
                      {t("docs.download")}
                    </button>
                  )}
                  {item.kind === "shared" &&
                    item.allowVaultDeposit &&
                    !item.depositedDocumentId &&
                    !depositState && (
                      <button
                        className="button is-signal"
                        disabled={action.pending}
                        onClick={() => void deposit()}
                      >
                        {t("arrivals.deposit")}
                      </button>
                    )}
                  {(item.depositedDocumentId || depositState === "saved") && (
                    <Link className="button" href="/arrivals?kind=personal">
                      {t("arrivals.openVault")}
                    </Link>
                  )}
                </div>
                {item.kind === "shared" && item.allowVaultDeposit && (
                  <p className="muted">{t("arrivals.depositNotice")}</p>
                )}
                {depositState === "preparing" && !item.depositedDocumentId && (
                  <Notice>{t("arrivals.depositPending")}</Notice>
                )}
              </>
            )}
            <a
              className="link"
              href={classicUrl(`/app/my-documents/${encodeURIComponent(id)}`)}
            >
              {t("arrivals.fullHistory")}
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

/** The recipient's collection uses only personal authority, never tenant lists. */
export function ArrivalsPage() {
  const { personal } = useReadySession();
  const { t, locale } = useI18n();
  const route = useRoute();
  const kind = route.query.get("kind") === "personal" ? "personal" : "shared";
  const selected = route.query.get("document") ?? route.segments[1];
  const q = (route.query.get("q") ?? "").slice(0, 200);
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  const params = new URLSearchParams({ kind, limit: "25" });
  if (q) params.set("q", q);
  const resource = usePages<PersonalDocumentItem>(
    personal && !selected ? `/personal/documents?${params}` : null,
  );
  function find(event: FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams({ kind });
    if (search.trim()) query.set("q", search.trim());
    navigate(`/arrivals?${query}`);
  }
  return (
    <>
      <Sign
        section={sections.find((section) => section.id === "arrivals")}
        title={t("arrivals.title")}
        also="ARRIVALS / ANKÜNFTE"
      />
      {!personal ? (
        <Notice>{t("arrivals.personalRequired")}</Notice>
      ) : selected ? (
        <ArrivalReader key={selected} id={selected} kind={kind} />
      ) : (
        <>
          <nav className="tabs" aria-label={t("arrivals.collections")}>
            <Link
              className={`tab ${kind === "shared" ? "is-current" : ""}`}
              href="/arrivals"
              aria-current={kind === "shared" ? "page" : undefined}
            >
              {t("arrivals.shared")}
            </Link>
            <Link
              className={`tab ${kind === "personal" ? "is-current" : ""}`}
              href="/arrivals?kind=personal"
              aria-current={kind === "personal" ? "page" : undefined}
            >
              {t("arrivals.personal")}
            </Link>
          </nav>
          <p className="muted document-intro">
            {t(
              kind === "shared"
                ? "arrivals.sharedIntro"
                : "arrivals.personalIntro",
            )}
          </p>
          <form className="document-search" onSubmit={find}>
            <Field label={t("arrivals.search")}>
              <input
                type="search"
                maxLength={200}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <button className="button" type="submit">
              {t("arrivals.search")}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void resource.refresh()}
            >
              {t("docs.refresh")}
            </button>
          </form>
          <section className="panel">
            <ErrorNotice
              error={resource.error}
              retry={() => void resource.refresh()}
            />
            {resource.loading && <DocumentLoading />}
            {!resource.loading && !resource.error && !resource.items.length && (
              <Empty title={t("arrivals.empty")}>
                <p>{t(q ? "arrivals.noResults" : "arrivals.emptyBody")}</p>
              </Empty>
            )}
            <ul className="document-list">
              {resource.items.map((item) => (
                <li key={item.id}>
                  <Link
                    className="document-row"
                    href={`/arrivals?kind=${kind}&document=${encodeURIComponent(item.id)}`}
                  >
                    <span className="document-symbol" aria-hidden="true">
                      <FilePdf size={28} />
                    </span>
                    <span className="document-row-main">
                      <strong>{item.title}</strong>
                      <span className="muted">
                        {item.sender} ·{" "}
                        {t("arrivals.until", {
                          date: formatDateTime(item.expiresAt, locale),
                        })}{" "}
                        UTC
                      </span>
                    </span>
                    <span
                      className={`plate ${item.status === "active" ? "is-ok" : "is-quiet"}`}
                    >
                      {t(`arrivals.status.${item.status}`)}
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            <LoadMore
              visible={resource.hasMore}
              loading={resource.loadingMore}
              onClick={() => void resource.more()}
            />
          </section>
        </>
      )}
    </>
  );
}
