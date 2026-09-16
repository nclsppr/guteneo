import {
  useCallback,
  useEffect,
  useState,
  useId,
  cloneElement,
  lazy,
  Suspense,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  ArrowClockwise,
  WarningCircle,
  FilePdf,
  ArrowRight,
} from "@phosphor-icons/react";
import {
  api,
  ApiError,
  type Channel,
  type Dispatch,
  type Page,
  recipientLabel,
  date,
  getDocumentContent,
  isPublicPreview,
} from "./api";
import { fr as t } from "./i18n";

export function go(path: string) {
  window.location.hash = path;
}
export function LoadMore<T>({
  path,
  data,
  onLoaded,
}: {
  path: string;
  data?: Page<T>;
  onLoaded: (page: Page<T>) => void;
}) {
  const action = useAction();
  if (!data?.nextCursor) return null;
  return (
    <>
      <button
        type="button"
        className="button subtle small pagination"
        disabled={action.pending}
        onClick={() =>
          void action.run(async () => {
            const next = await api<Page<T>>(
              `${path}?cursor=${encodeURIComponent(data.nextCursor ?? "")}`,
            );
            onLoaded({
              items: [...data.items, ...next.items],
              nextCursor: next.nextCursor,
            });
          })
        }
      >
        {action.pending ? t.loading : t.dispatch.loadMore}
      </button>
      <ErrorNotice error={action.error} />
    </>
  );
}
export function useRoute() {
  const [route, setRoute] = useState(
    window.location.hash.slice(1) ||
      (window.location.pathname.startsWith("/app") ? "/app" : "/"),
  );
  useEffect(() => {
    const update = () => {
      setRoute(window.location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setError(error as Error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, error, loading, refresh, setData };
}
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run, clear: () => setError(undefined) };
}
export function ErrorNotice({
  error,
  retry,
}: {
  error?: Error;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <WarningCircle size={22} aria-hidden="true" />
      <div>
        <strong>{t.errorTitle}</strong>
        <p>{error.message}</p>
        {error instanceof ApiError && (
          <small className="mono">{error.code}</small>
        )}
        {retry && (
          <button className="text-button" onClick={retry}>
            {t.retry}
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status" aria-label={t.loading}>
      <span />
      <span />
      <span />
      <p>{t.loading}</p>
    </div>
  );
}
export function PageHeading({
  title,
  intro,
  action,
}: {
  title: string;
  intro?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {action}
    </header>
  );
}
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FilePdf size={36} weight="light" aria-hidden="true" />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function Status({
  status,
  channel,
}: {
  status: string;
  channel?: Channel;
}) {
  let text = t.statuses[status] ?? status;
  if (status === "delivered" && channel === "email")
    text = t.statuses.email_delivered ?? text;
  if (status === "delivered" && channel === "fax")
    text = t.statuses.fax_delivered ?? text;
  return <span className={`status status-${status}`}>{text}</span>;
}
export function ChannelLabel({ channel }: { channel: Channel }) {
  return (
    <span className="channel-label">{t.channels[channel] ?? channel}</span>
  );
}
export function RefreshButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="button subtle small"
      onClick={onClick}
      disabled={disabled}
    >
      <ArrowClockwise size={16} aria-hidden="true" />
      {t.refresh}
    </button>
  );
}
export function DispatchTable({ items }: { items: Dispatch[] }) {
  if (!items.length)
    return (
      <EmptyState
        title={t.dispatch.countEmpty}
        action={
          <a className="button primary" href="#/app/prepare">
            {t.dispatch.new}
            <ArrowRight size={17} />
          </a>
        }
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t.recipient}</th>
            <th>{t.channel}</th>
            <th>{t.status}</th>
            <th>{t.created}</th>
            <th>
              <span className="sr-only">{t.open}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id}>
              <td>
                <a className="row-link" href={`#/app/dispatch/${d.id}`}>
                  {recipientLabel(d) || d.id}
                  <span className="reference mono">{d.id}</span>
                </a>
              </td>
              <td>
                <ChannelLabel channel={d.channel} />
              </td>
              <td>
                <Status status={d.status} channel={d.channel} />
                {d.mode === "simulation" && (
                  <small className="sub-label">{t.simulation}</small>
                )}
              </td>
              <td className="date-cell">{date(d.created_at)}</td>
              <td>
                <a
                  className="icon-link"
                  href={`#/app/dispatch/${d.id}`}
                  aria-label={`${t.open} ${d.id}`}
                >
                  <ArrowRight size={20} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const LazyPdfViewer = lazy(() => import("./pdf-viewer"));

export function PdfPreview({
  id,
  title = t.preview,
}: {
  id: string;
  title?: string;
}) {
  const download = useAction();
  async function downloadSample() {
    await download.run(async () => {
      const bytes = await getDocumentContent(id);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "guteneo-demonstration.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    });
  }
  return (
    <div className="pdf-preview">
      <div className="preview-label">
        <FilePdf size={18} aria-hidden="true" />
        <span>{title}</span>
        {isPublicPreview ? (
          <button
            className="icon-link"
            onClick={() => void downloadSample()}
            disabled={download.pending}
          >
            Télécharger le PDF d’exemple <ArrowRight size={15} />
          </button>
        ) : (
          <a
            href={`/api/documents/${encodeURIComponent(id)}/content`}
            target="_blank"
            rel="noreferrer"
          >
            {t.download}
            <ArrowRight size={15} />
          </a>
        )}
      </div>
      <Suspense fallback={<Loading />}>
        <LazyPdfViewer id={id} />
      </Suspense>
      <ErrorNotice error={download.error} />
      <p className="field-hint">
        {isPublicPreview
          ? "Document fictif fourni pour explorer la démonstration."
          : t.documents.pdfFallback}
      </p>
    </div>
  );
}
export function EmailPreview({ html }: { html: string }) {
  const content = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.6 Georgia,serif;color:#181b22;padding:24px;overflow-wrap:anywhere}img{max-width:100%}</style></head><body>${html}</body></html>`;
  return (
    <iframe
      className="email-preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={content}
      title={t.dispatch.htmlPreview}
    />
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        "aria-describedby": hint
          ? `${id}-help`
          : children.props["aria-describedby"],
      })}
      {hint && <small id={`${id}-help`}>{hint}</small>}
    </div>
  );
}
export function Definition({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="definition">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
