import {
  useCallback,
  useEffect,
  useState,
  useId,
  useRef,
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
  useEffect(() => {
    if (!route.startsWith("/app")) return;
    // Route changes replace the content without a browser navigation. Keep
    // keyboard and screen-reader users at the newly opened workspace page.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement?.closest('[role="alert"]')) return;
      document.getElementById("main-content")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [route]);
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
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) notice.current?.focus();
  }, [error]);
  if (!error) return null;
  return (
    <div className="notice error" role="alert" tabIndex={-1} ref={notice}>
      <WarningCircle size={22} aria-hidden="true" />
      <div>
        <strong>{t.errorTitle}</strong>
        <p>
          {error instanceof ApiError
            ? (postalErrorMessage(error.code) ??
              sesErrorMessage(error.code) ??
              error.message)
            : error.message}
        </p>
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

/** Fixed copy only: provider response bodies can contain private identities. */
function postalErrorMessage(code?: string): string | undefined {
  const messages: Record<string, string> = {
    POSTAL_DRAFT_NOT_READY:
      "Pingen analyse encore ce brouillon. Réessayez le devis après son analyse.",
    POSTAL_DRAFT_TRANSFER_DISABLED:
      "La préparation du courrier est actuellement indisponible. Vous pouvez consulter le suivi d’un brouillon existant.",
    POSTAL_DRAFT_RECONCILIATION_REQUIRED:
      "Le résultat du transfert doit être vérifié. Contactez Guteneo avant de créer un autre brouillon.",
    POSTAL_DRAFT_ALREADY_USED:
      "Ce brouillon est déjà associé à un envoi. Consultez son suivi avant de continuer.",
    POSTAL_ADDRESS_MISMATCH:
      "L’adresse du PDF ne correspond pas au destinataire. Vérifiez les deux avant de continuer.",
    POSTAL_ADDRESS_PREVIEW_UNAVAILABLE:
      "L’extrait d’adresse est indisponible. Actualisez la page pour vérifier s’il est prêt.",
    POSTAL_PREFLIGHT_EXPIRED:
      "Ce contrôle a expiré. Faites contrôler à nouveau le document avant tout transfert.",
    POSTAL_PREFLIGHT_NOT_FOUND:
      "Ce contrôle postal n’est pas accessible dans votre espace.",
    POSTAL_PREFLIGHT_REQUIRED:
      "Le PDF doit être contrôlé et revu dans Guteneo avant cette étape.",
    POSTAL_PREFLIGHT_STALE:
      "Le document ou ses autorisations ont changé. Actualisez le suivi avant de continuer.",
    POSTAL_PREPARED_DRAFT_REQUIRED:
      "Ouvrez la revue du document pour préparer son brouillon avant de demander le devis.",
    POSTAL_PROFILE_CHANGED:
      "Les paramètres d’impression ont changé. Une nouvelle vérification du PDF est nécessaire.",
    POSTAL_PROFILE_UNQUALIFIED:
      "Les paramètres postaux de Pingen ne peuvent pas être vérifiés pour le moment. Réessayez leur consultation plus tard.",
    POSTAL_RENDERER_UNAVAILABLE:
      "Le contrôle du PDF est momentanément indisponible. Votre document n’a pas été transmis à Pingen.",
    POSTAL_RENDER_FAILED:
      "Le contrôle du PDF n’a pas abouti. Consultez son état avant de recommencer.",
    POSTAL_RENDER_TIMEOUT:
      "Le contrôle du PDF a dépassé le délai prévu. Aucun transfert à Pingen n’est autorisé.",
    POSTAL_RENDER_PROOF_INVALID:
      "Le résultat du contrôle du PDF est incomplet. Le transfert reste bloqué.",
  };
  return code ? messages[code] : undefined;
}

export function sesErrorMessage(code?: string): string | undefined {
  if (!code) return undefined;
  const messages: Record<string, string> = {
    SES_ACCOUNT_DAILY_LIMIT:
      "La capacité d’envoi d’e-mails de Guteneo est atteinte. Cet envoi n’a pas été transmis. Réessayez plus tard en préparant un nouvel envoi.",
    SES_ACCOUNT_RATE_LIMIT:
      "Le service d’e-mail traite déjà un envoi ou vient d’en traiter un. Cet envoi n’a pas été transmis. Patientez avant de préparer un nouvel envoi.",
    SES_DAILY_QUOTA_EXCEEDED:
      "AWS a refusé cet envoi car le quota d’e-mails sur les dernières 24 heures est atteint. Aucun envoi n’a été accepté. Réessayez plus tard en préparant un nouvel envoi.",
    SES_RATE_EXCEEDED:
      "AWS a refusé cet envoi car les demandes sont trop rapprochées. Aucun envoi n’a été accepté. Patientez avant de préparer un nouvel envoi.",
    SES_THROTTLED:
      "AWS limite temporairement les demandes d’envoi. Ce message a été refusé ; il ne sera pas renvoyé automatiquement.",
    SES_IDENTITY_NOT_VERIFIED:
      "AWS a refusé cet envoi : une adresse ou un domaine n’est pas vérifié. Pendant la phase restreinte SES, les destinataires doivent aussi être vérifiés. Aucun envoi n’a été accepté.",
    SES_SENDER_NOT_VERIFIED:
      "Le domaine d’expédition doit encore être vérifié auprès d’AWS. Aucun envoi n’a été accepté. Le raccordement doit être corrigé par l’équipe Guteneo.",
    SES_MESSAGE_REJECTED:
      "AWS a refusé le message. Aucun envoi n’a été accepté. Vérifiez son contenu et les adresses avant de préparer une nouvelle version.",
    SES_REQUEST_REJECTED:
      "AWS a refusé la demande d’envoi. Aucun envoi n’a été accepté. Le contenu et les paramètres doivent être vérifiés avant une nouvelle préparation.",
    SES_ACCOUNT_SUSPENDED:
      "AWS a suspendu les envois de ce compte. Ce message a été refusé. L’équipe Guteneo doit rétablir le service avant tout nouvel essai.",
    SES_SENDING_PAUSED:
      "L’envoi d’e-mails est actuellement suspendu chez AWS. Ce message a été refusé ; il ne sera pas renvoyé automatiquement.",
    SES_RESOURCE_LIMIT:
      "AWS a refusé cet envoi à cause d’une limite du service. L’équipe Guteneo doit vérifier sa configuration avant tout nouvel essai.",
    SES_CONFIGURATION_MISSING:
      "La configuration d’envoi attendue est indisponible chez AWS. Ce message a été refusé. Le raccordement doit être corrigé par l’équipe Guteneo.",
    SES_AUTHORIZATION_FAILED:
      "AWS n’autorise pas ce raccordement à envoyer des e-mails. Ce message a été refusé. L’équipe Guteneo doit vérifier les accès du service.",
    SES_LIMITS_NOT_CONFIGURED:
      "Les limites du compte d’e-mail ne sont pas encore configurées. Cet envoi n’a pas été transmis.",
    SES_LIMITS_UNAVAILABLE:
      "Le contrôle de capacité du service d’e-mail est temporairement indisponible. Cet envoi n’a pas été transmis.",
    SES_ACTIVE_ATTEMPT_REQUIRED:
      "Cette tentative ne peut plus être transmise. Consultez son suivi avant toute autre action.",
    SES_NOT_CONFIGURED:
      "Le raccordement e-mail n’est pas encore prêt. Cet envoi n’a pas été transmis.",
    SES_ACCOUNT_REQUIRED:
      "Le compte d’envoi AWS doit être identifié avant de transmettre cet e-mail. L’équipe Guteneo doit terminer le raccordement.",
    SES_IDENTITY_REQUIRED:
      "L’identité du compte e-mail et son suivi doivent encore être qualifiés. Cet envoi n’a pas été transmis.",
    SES_RECIPIENT_NOT_QUALIFIED:
      "Ce destinataire n’est pas encore autorisé pour la phase restreinte d’envoi. Son adresse doit être vérifiée auprès d’AWS et qualifiée par l’équipe Guteneo. Cet envoi n’a pas été transmis.",
    SES_MODE_REQUIRED:
      "Le mode d’envoi du compte AWS doit être qualifié avant de transmettre cet e-mail.",
    SES_RESPONSE_UNKNOWN:
      "La réponse d’AWS n’a pas permis de confirmer le résultat. Ne recréez pas cet envoi : le suivi doit être vérifié pour éviter un doublon. Son crédit reste réservé.",
    SES_ATTEMPT_ALREADY_RESERVED:
      "Cette tentative a déjà été prise en charge. Ne recréez pas cet envoi : consultez son suivi pour éviter un doublon.",
  };
  return Object.hasOwn(messages, code) ? messages[code] : undefined;
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
      <table className="responsive-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">
              {t.recipient}
            </th>
            <th role="columnheader" scope="col">
              {t.channel}
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
          {items.map((d) => (
            <tr role="row" key={d.id}>
              <td role="cell">
                <span className="mobile-cell-label" aria-hidden="true">
                  {t.recipient}
                </span>
                <a className="row-link" href={`#/app/dispatch/${d.id}`}>
                  {recipientLabel(d) || d.id}
                  <span className="reference mono">{d.id}</span>
                </a>
              </td>
              <td role="cell">
                <span className="mobile-cell-label" aria-hidden="true">
                  {t.channel}
                </span>
                <ChannelLabel channel={d.channel} />
              </td>
              <td role="cell">
                <span className="mobile-cell-label" aria-hidden="true">
                  {t.status}
                </span>
                <Status status={d.status} channel={d.channel} />
                {d.mode === "simulation" && (
                  <small className="sub-label">{t.simulation}</small>
                )}
              </td>
              <td role="cell" className="date-cell">
                <span className="mobile-cell-label" aria-hidden="true">
                  {t.created}
                </span>
                {date(d.created_at)}
              </td>
              <td role="cell">
                <span className="mobile-cell-label" aria-hidden="true">
                  {t.open}
                </span>
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
            className="pdf-download"
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
        "aria-describedby":
          [children.props["aria-describedby"], hint ? `${id}-help` : undefined]
            .filter(Boolean)
            .join(" ") || undefined,
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
