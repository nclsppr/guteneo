import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LockKey,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react";
import {
  api,
  date,
  money,
  permissionsFor,
  type DocumentRecord,
  type Page,
  type Session,
} from "./api";
import {
  ConfirmAction,
  Definition,
  EmptyState,
  ErrorNotice,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import { RolePermissionNotice } from "./role-guide";
import { msg } from "./messages";
import { getLocale } from "./locale";
import "./secure-documents.css";
import { SecureAuditHistory } from "./secure-audit-history";
import type { SecureDistributionView } from "../../../packages/contracts/src/secure-distribution";
import { personalApi, personalBlob } from "./personal-api";

type RetentionOption = { days: number; priceMinor: number };
export type SecureCatalog = {
  retention: RetentionOption[];
  personalRetention: RetentionOption[];
  currency: string;
  priceVersion: string;
};
export type SecurePublication = SecureDistributionView;

export function SecureDistributionPage({
  route,
  session,
}: {
  route: string;
  session: Session;
}) {
  const page = route.split("?")[0];
  const permissions = permissionsFor(session);
  if (page === "/app/secure-distributions/new")
    return permissions.prepareDispatches ? (
      <SecureDistributionComposer />
    ) : (
      <RolePermissionNotice />
    );
  if (page?.startsWith("/app/secure-distribution/"))
    return (
      <SecureDistributionDetail
        key={page}
        id={page.slice("/app/secure-distribution/".length)}
        session={session}
      />
    );
  return <SecureDistributionList canPrepare={permissions.prepareDispatches} />;
}

function publicationStatus(status: string) {
  const labels: Record<string, string> = {
    prepared: msg("À vérifier"),
    draft: msg("À vérifier"),
    approved: msg("Approuvé, à activer"),
    active: msg("Accès actif"),
    revoked: msg("Accès révoqué"),
    expired: msg("Accès expiré"),
    pending: msg("Préparation en cours"),
    preparing: msg("Préparation en cours"),
    failed: msg("Préparation échouée"),
  };
  return labels[status] ?? msg("État à vérifier");
}

function SecureDistributionList({ canPrepare }: { canPrepare: boolean }) {
  const resource = useResource<Page<SecurePublication>>(
    "/secure-distributions",
  );
  return (
    <div className="secure-document-layout">
      <PageHeading
        title={msg("Distributions sécurisées")}
        intro={msg(
          "Un accès individuel, une durée définie et un journal des événements observables.",
        )}
        action={
          canPrepare && (
            <a className="button primary" href="#/app/secure-distributions/new">
              <Plus size={18} aria-hidden="true" />
              {msg("Nouveau partage")}
            </a>
          )
        }
      />
      <div className="section-toolbar">
        <p>
          {msg(
            "La révocation bloque les nouveaux accès et ne rembourse pas la période activée.",
          )}
        </p>
        <RefreshButton onClick={resource.refresh} />
      </div>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : resource.data?.items.length ? (
        <ul className="secure-document-list">
          {resource.data.items.map((item) => (
            <li key={item.id}>
              <div>
                <h2>{item.source.name}</h2>
                <p>{item.recipient.name || item.recipient.address}</p>
                <span className="secure-document-tag">
                  <LockKey size={14} aria-hidden="true" />
                  {publicationStatus(item.status)}
                </span>
                {item.expiresAt && (
                  <small>
                    {msg("Disponible jusqu’au {0}", date(item.expiresAt))}
                  </small>
                )}
              </div>
              <a
                className="button"
                href={`#/app/secure-distribution/${encodeURIComponent(item.id)}`}
              >
                {msg("Voir le partage")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        !resource.error && (
          <EmptyState
            title={msg("Aucune distribution sécurisée")}
            text={msg(
              "Préparez un partage à partir d’un PDF vérifié dans cet atelier.",
            )}
            action={
              canPrepare && (
                <a className="button" href="#/app/secure-distributions/new">
                  {msg("Nouveau partage")}
                </a>
              )
            }
          />
        )
      )}
      <LoadMore
        path="/secure-distributions"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </div>
  );
}

function SecureDistributionComposer() {
  const catalog = useResource<SecureCatalog>("/secure-distributions/catalog");
  const documents = useResource<Page<DocumentRecord>>("/documents");
  const [documentId, setDocumentId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);
  const [allowOriginalDownload, setAllowOriginalDownload] = useState(false);
  const [allowVaultDeposit, setAllowVaultDeposit] = useState(false);
  const [personalRetentionDays, setPersonalRetentionDays] = useState(365);
  const [subject, setSubject] = useState(() =>
    msg("Un document est disponible dans Guteneo"),
  );
  const [message, setMessage] = useState(() =>
    msg("Un document vous a été adressé dans votre espace Guteneo."),
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const action = useAction();
  const readyDocuments =
    documents.data?.items.filter((document) => document.status === "ready") ??
    [];
  const selectedDocument = readyDocuments.find(
    (document) => document.id === documentId,
  );
  const sharedPrice = catalog.data?.retention.find(
    (option) => option.days === retentionDays,
  )?.priceMinor;
  const personalPrice = catalog.data?.personalRetention.find(
    (option) => option.days === personalRetentionDays,
  )?.priceMinor;
  const displayedPrice =
    sharedPrice === undefined ||
    (allowVaultDeposit && personalPrice === undefined)
      ? undefined
      : sharedPrice + (allowVaultDeposit ? (personalPrice ?? 0) : 0);
  function changed() {
    setIdempotencyKey(crypto.randomUUID());
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const prepared = await api<SecurePublication>("/secure-distributions", {
        method: "POST",
        key: idempotencyKey,
        body: {
          documentId,
          recipient: {
            address: recipientAddress.trim(),
            ...(recipientName.trim() ? { name: recipientName.trim() } : {}),
          },
          retentionDays,
          allowOriginalDownload,
          allowVaultDeposit,
          personalRetentionDays,
          ...(subject.trim() ? { subject: subject.trim() } : {}),
          message: message.trim(),
          notificationLocale: getLocale(),
        },
      });
      go(`/app/secure-distribution/${encodeURIComponent(prepared.id)}`);
    });
  }
  return (
    <div className="secure-document-layout">
      <a className="text-link" href="#/app/secure-distributions">
        <ArrowLeft size={17} aria-hidden="true" />
        {msg("Revenir aux distributions")}
      </a>
      <PageHeading
        title={msg("Nouveau partage sécurisé")}
        intro={msg(
          "Le destinataire utilise son compte Guteneo. Recevoir un document ne donne aucun droit dans votre atelier.",
        )}
      />
      <ErrorNotice
        error={catalog.error ?? documents.error}
        retry={() => {
          catalog.refresh();
          documents.refresh();
        }}
      />
      {catalog.loading || documents.loading ? (
        <Loading />
      ) : (
        catalog.data && (
          <form
            className="secure-document-form"
            aria-busy={action.pending}
            onSubmit={(event) => void prepare(event)}
          >
            <section className="secure-document-panel">
              <h2>{msg("Document et destinataire")}</h2>
              <Field
                label={msg("PDF vérifié")}
                hint={msg(
                  "Le document original reste inchangé. La consultation utilise des pages préparées pour le destinataire.",
                )}
              >
                <select
                  value={documentId}
                  required
                  onChange={(event) => {
                    setDocumentId(event.target.value);
                    changed();
                  }}
                >
                  <option value="">{msg("Choisir un document")}</option>
                  {readyDocuments.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!readyDocuments.length && (
                <p>
                  <a href="#/app/documents">
                    {msg("Importer et vérifier un PDF")}
                  </a>
                </p>
              )}
              <Field label={msg("Nom du destinataire")}>
                <input
                  value={recipientName}
                  autoComplete="off"
                  maxLength={160}
                  onChange={(event) => {
                    setRecipientName(event.target.value);
                    changed();
                  }}
                />
              </Field>
              <Field
                label={msg("Adresse e-mail du destinataire")}
                hint={msg(
                  "Choisissez une adresse individuelle. Le rattachement au bon compte devra être confirmé avant l’accès.",
                )}
              >
                <input
                  type="email"
                  value={recipientAddress}
                  required
                  autoComplete="off"
                  maxLength={254}
                  onChange={(event) => {
                    setRecipientAddress(event.target.value);
                    changed();
                  }}
                />
              </Field>
            </section>
            <section className="secure-document-panel">
              <h2>{msg("Durée et droits")}</h2>
              <Field label={msg("Durée de l’accès partagé")}>
                <select
                  value={retentionDays}
                  onChange={(event) => {
                    setRetentionDays(Number(event.target.value));
                    changed();
                  }}
                >
                  {catalog.data.retention.map((option) => (
                    <option key={option.days} value={option.days}>
                      {msg(
                        "{0} jours · {1} HT",
                        option.days,
                        money(option.priceMinor),
                      )}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="secure-document-check">
                <input
                  type="checkbox"
                  checked={allowOriginalDownload}
                  onChange={(event) => {
                    setAllowOriginalDownload(event.target.checked);
                    changed();
                  }}
                />
                <span>
                  {msg("Autoriser le téléchargement du PDF original")}
                  <small>
                    {msg(
                      "Une copie téléchargée ne peut plus être rappelée. Ses ouvertures ultérieures ne sont pas suivies.",
                    )}
                  </small>
                </span>
              </label>
              <label className="secure-document-check">
                <input
                  type="checkbox"
                  checked={allowVaultDeposit}
                  onChange={(event) => {
                    setAllowVaultDeposit(event.target.checked);
                    changed();
                  }}
                />
                <span>
                  {msg("Autoriser une copie personnelle conservée")}
                  <small>
                    {msg(
                      "Après remise, la copie reste accessible pour sa durée propre, même si vous révoquez le partage.",
                    )}{" "}
                    {msg(
                      "L’option est facturée à l’activation, même si le destinataire ne conserve pas de copie.",
                    )}
                  </small>
                </span>
              </label>
              {allowVaultDeposit && (
                <Field label={msg("Durée de la copie personnelle")}>
                  <select
                    value={personalRetentionDays}
                    onChange={(event) => {
                      setPersonalRetentionDays(Number(event.target.value));
                      changed();
                    }}
                  >
                    {catalog.data.personalRetention.map((option) => (
                      <option key={option.days} value={option.days}>
                        {msg(
                          "{0} jours · {1} HT",
                          option.days,
                          money(option.priceMinor),
                        )}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </section>
            <section className="secure-document-panel">
              <h2>{msg("Message d’invitation")}</h2>
              <Field label={msg("Objet")}>
                <input
                  value={subject}
                  maxLength={160}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    changed();
                  }}
                />
              </Field>
              <Field
                label={msg("Message")}
                hint={msg(
                  "Évitez toute information confidentielle dans l’invitation par e-mail.",
                )}
              >
                <textarea
                  value={message}
                  rows={4}
                  maxLength={4000}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    changed();
                  }}
                />
              </Field>
            </section>
            <div className="secure-document-price">
              <strong>
                {displayedPrice === undefined
                  ? msg("Prix à vérifier")
                  : msg("Conservation : {0} HT", money(displayedPrice))}
              </strong>
              <p>{msg("Tarif par PDF et par destinataire.")}</p>
              <p>
                {msg(
                  "Le transport de l’invitation sera ajouté au devis final. La période activée est due en totalité, même après révocation du document.",
                )}
              </p>
            </div>
            <button
              className="button primary"
              type="submit"
              disabled={
                action.pending ||
                !selectedDocument ||
                displayedPrice === undefined
              }
            >
              {action.pending
                ? msg("Préparation en cours…")
                : msg("Préparer et vérifier le partage")}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <ErrorNotice error={action.error} />
          </form>
        )
      )}
    </div>
  );
}

function SecureDistributionDetail({
  id,
  session,
}: {
  id: string;
  session: Session;
}) {
  const resource = useResource<SecurePublication>(
    `/secure-distributions/${encodeURIComponent(id)}`,
  );
  const action = useAction();
  const [reviewed, setReviewed] = useState(false);
  const [recipientRequested, setRecipientRequested] = useState(false);
  const [auditVersion, setAuditVersion] = useState(0);
  const [bindingReviewed, setBindingReviewed] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState(
    "independent_channel",
  );
  const permissions = permissionsFor(session);
  const publication = resource.data;
  const refresh = resource.refresh;
  const shouldPoll =
    (publication?.status === "preparing" || publication?.status === "active") &&
    !resource.loading &&
    !resource.error;
  const pollingDelay = publication?.status === "preparing" ? 3000 : 10000;
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") refresh();
    }, pollingDelay);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setAuditVersion((current) => current + 1);
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shouldPoll, refresh, pollingDelay]);
  async function mutate(operation: "approve" | "activate" | "revoke") {
    await action.run(async () => {
      await api(
        `/secure-distributions/${encodeURIComponent(id)}/${operation}`,
        {
          method: "POST",
          key: `${id}:${operation}`,
          body:
            operation === "approve"
              ? { reviewed: true, recipientRequested }
              : {},
        },
      );
      resource.refresh();
    });
  }
  async function bindRecipient() {
    if (!publication?.pendingClaim) return;
    await action.run(async () => {
      await api(`/secure-distributions/${encodeURIComponent(id)}/bind`, {
        method: "POST",
        body: {
          recipientUserId: publication.pendingClaim!.recipientUserId,
          verificationMethod,
        },
      });
      setBindingReviewed(false);
      resource.refresh();
    });
  }
  return (
    <div className="secure-document-layout">
      <a className="text-link" href="#/app/secure-distributions">
        <ArrowLeft size={17} aria-hidden="true" />
        {msg("Revenir aux distributions")}
      </a>
      <PageHeading
        title={msg("Vérifier le partage sécurisé")}
        action={
          <RefreshButton
            onClick={() => {
              setAuditVersion((current) => current + 1);
              resource.refresh();
            }}
          />
        }
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !publication ? (
        <Loading />
      ) : (
        publication && (
          <>
            <section className="secure-document-panel">
              <h2>{publication.source.name}</h2>
              <p>
                <span className="secure-document-tag">
                  <LockKey size={14} aria-hidden="true" />
                  {publication.approved && publication.status === "prepared"
                    ? msg("Approuvé, à activer")
                    : publicationStatus(publication.status)}
                </span>
              </p>
              <dl className="secure-document-facts">
                <Definition label={msg("Destinataire")}>
                  {publication.recipient.name && (
                    <>
                      {publication.recipient.name}
                      <br />
                    </>
                  )}
                  {publication.recipient.address}
                </Definition>
                <Definition label={msg("Durée de l’accès partagé")}>
                  {msg("{0} jours", publication.policy.retentionDays)}
                </Definition>
                <Definition label={msg("PDF original")}>
                  {publication.policy.allowOriginalDownload
                    ? msg("Téléchargement autorisé")
                    : msg("Téléchargement désactivé")}
                </Definition>
                <Definition label={msg("Copie personnelle")}>
                  {publication.policy.allowVaultDeposit
                    ? msg(
                        "Autorisée · {0} jours",
                        publication.policy.personalRetentionDays,
                      )
                    : msg("Désactivée")}
                </Definition>
                {publication.expiresAt && (
                  <Definition label={msg("Échéance")}>
                    {date(publication.expiresAt)}
                  </Definition>
                )}
              </dl>
              <div className="secure-document-price">
                <strong>
                  {msg("{0} HT", money(publication.quote.totalMinor))}
                </strong>
                <dl className="secure-document-facts">
                  <Definition label={msg("Conservation partagée")}>
                    {msg("{0} HT", money(publication.quote.sharedMinor))}
                  </Definition>
                  <Definition label={msg("Conservation personnelle")}>
                    {msg("{0} HT", money(publication.quote.personalMinor))}
                  </Definition>
                  <Definition label={msg("Envoi de l’invitation")}>
                    {msg("{0} HT", money(publication.quote.transportMinor))}
                  </Definition>
                </dl>
                <p>
                  {msg(
                    "La période activée est due en totalité. Révoquer ou désactiver le partage ne donne pas droit à remboursement.",
                  )}
                </p>
              </div>
            </section>
            <section className="secure-document-panel">
              <h2>{msg("Message d’invitation")}</h2>
              <dl className="secure-document-facts">
                <Definition label={msg("Objet")}>
                  {publication.invitation.subject}
                </Definition>
              </dl>
              <p className="secure-document-invitation-message">
                {publication.invitation.message}
              </p>
              <p className="field-hint">
                {msg(
                  "Le lien individuel et les instructions de connexion seront ajoutés à cette invitation.",
                )}
              </p>
            </section>
            {publication.status === "preparing" && (
              <section className="secure-document-panel" role="status">
                <Loading />
                <p>
                  {msg(
                    "Le rendu sécurisé est en préparation. Cette page se met à jour pendant le traitement.",
                  )}
                </p>
              </section>
            )}
            {publication.status === "prepared" && !publication.approved && (
              <>
                <PreparedDistributionPreview
                  publication={publication}
                  session={session}
                />
                <section className="secure-document-panel">
                  <h2>{msg("Approbation du partage")}</h2>
                  <p>
                    {msg(
                      "Vérifiez le PDF, le destinataire, les droits et le prix. L’approbation et l’activation sont deux étapes distinctes.",
                    )}
                  </p>
                  {permissions.approveDispatches ? (
                    <>
                      <label className="secure-document-check">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          onChange={(event) =>
                            setReviewed(event.target.checked)
                          }
                        />
                        <span>
                          {msg(
                            "J’ai vérifié le document, le destinataire, les droits et le prix.",
                          )}
                        </span>
                      </label>
                      <label className="secure-document-check">
                        <input
                          type="checkbox"
                          checked={recipientRequested}
                          onChange={(event) =>
                            setRecipientRequested(event.target.checked)
                          }
                        />
                        <span>
                          {msg(
                            "Je confirme que ce destinataire a demandé cet e-mail et son document. Cet envoi ne constitue pas une prospection.",
                          )}
                        </span>
                      </label>
                      <button
                        className="button primary"
                        type="button"
                        disabled={
                          !reviewed || !recipientRequested || action.pending
                        }
                        onClick={() => void mutate("approve")}
                      >
                        <ShieldCheck size={18} aria-hidden="true" />
                        {msg("Approuver ce partage")}
                      </button>
                    </>
                  ) : (
                    <RolePermissionNotice />
                  )}
                </section>
              </>
            )}
            {publication.status === "prepared" &&
              publication.approved &&
              permissions.approveDispatches && (
                <section className="secure-document-panel">
                  <h2>{msg("Activer le partage")}</h2>
                  <p>
                    {msg(
                      "Cette action active la période payante et prépare l’invitation. Le prix reste dû si vous révoquez ensuite le partage.",
                    )}
                  </p>
                  <ConfirmAction
                    className="button primary"
                    label={msg("Activer le partage")}
                    question={msg(
                      "Activer ce partage au prix de {0} HT ?",
                      money(publication.quote.totalMinor),
                    )}
                    confirmLabel={msg("Confirmer l’activation")}
                    disabled={action.pending}
                    onConfirm={() => void mutate("activate")}
                  />
                </section>
              )}
            {publication.status === "active" &&
              publication.pendingClaim &&
              permissions.approveDispatches && (
                <section className="secure-document-panel">
                  <h2>{msg("Confirmer le destinataire")}</h2>
                  <p>
                    {msg(
                      "Ce compte a demandé l’accès à votre partage. Vérifiez son association au destinataire par un moyen indépendant avant de confirmer.",
                    )}
                  </p>
                  <p>
                    <strong>{publication.pendingClaim.name}</strong>
                    <br />
                    {publication.pendingClaim.email}
                  </p>
                  <Field label={msg("Méthode de vérification")}>
                    <select
                      value={verificationMethod}
                      onChange={(event) =>
                        setVerificationMethod(event.target.value)
                      }
                    >
                      <option value="known_relationship">
                        {msg("Relation déjà connue")}
                      </option>
                      <option value="independent_channel">
                        {msg("Canal indépendant connu")}
                      </option>
                      <option value="qualified_identity">
                        {msg("Identité qualifiée")}
                      </option>
                    </select>
                  </Field>
                  <label className="secure-document-check">
                    <input
                      type="checkbox"
                      checked={bindingReviewed}
                      onChange={(event) =>
                        setBindingReviewed(event.target.checked)
                      }
                    />
                    <span>
                      {msg(
                        "J’ai vérifié que ce compte appartient au destinataire prévu.",
                      )}
                    </span>
                  </label>
                  <button
                    className="button primary"
                    type="button"
                    disabled={!bindingReviewed || action.pending}
                    onClick={() => void bindRecipient()}
                  >
                    {msg("Confirmer l’association")}
                  </button>
                </section>
              )}
            {publication.recipientBinding === "confirmed" && (
              <p role="status">
                {msg("Le destinataire est associé au compte confirmé.")}
              </p>
            )}
            {publication.status === "active" &&
              permissions.approveDispatches && (
                <section className="secure-document-panel">
                  <h2>{msg("Gérer l’accès")}</h2>
                  <p>
                    {msg(
                      "La révocation bloque les nouveaux accès. Elle ne supprime ni les fichiers téléchargés ni les copies personnelles déjà remises.",
                    )}
                  </p>
                  <ConfirmAction
                    label={msg("Révoquer ce partage")}
                    question={msg(
                      "Bloquer les nouveaux accès sans remboursement ?",
                    )}
                    confirmLabel={msg("Révoquer l’accès")}
                    disabled={action.pending}
                    onConfirm={() => void mutate("revoke")}
                  />
                </section>
              )}
            <ErrorNotice error={action.error} />
            <section className="secure-document-panel">
              <h2>{msg("Journal de l’atelier")}</h2>
              {publication.status === "active" && (
                <p className="field-hint">
                  {msg(
                    "Le journal s’actualise automatiquement lorsque cette page est visible.",
                  )}
                </p>
              )}
              <p>
                {msg(
                  "Un affichage déclaré ne prouve pas la lecture. Une transmission du PDF ne prouve pas son enregistrement sur le disque.",
                )}
              </p>
              <SecureAuditHistory
                key={`${id}:${auditVersion}`}
                events={publication.audit}
                nextCursor={publication.auditNextCursor}
                getOlder={(cursor) =>
                  api(
                    `/secure-distributions/${encodeURIComponent(id)}/events?cursor=${encodeURIComponent(cursor)}`,
                  )
                }
              />
            </section>
          </>
        )
      )}
    </div>
  );
}

function PreparedDistributionPreview({
  publication,
  session,
}: {
  publication: SecurePublication;
  session: Session;
}) {
  const [page, setPage] = useState(1);
  const [url, setUrl] = useState<string>();
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState<string>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setUrl(undefined);
    setText(undefined);
    setError(undefined);
    if (textMode) {
      personalApi<{ text: string }>(
        `/secure-distributions/${encodeURIComponent(publication.id)}/preview/${page}/text`,
        session,
        { signal: controller.signal },
      )
        .then((result) => setText(result.text))
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(cause as Error);
        });
      return () => controller.abort();
    }
    personalBlob(
      `/secure-distributions/${encodeURIComponent(publication.id)}/preview/${page}`,
      session,
      { signal: controller.signal, expectedType: "image" },
    )
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause as Error);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [publication.id, page, session, textMode]);
  return (
    <section aria-label={msg("Aperçu du document partagé")}>
      <div className="secure-document-reader-toolbar">
        <button
          type="button"
          className="button small"
          aria-pressed={textMode}
          onClick={() => setTextMode((current) => !current)}
        >
          {textMode
            ? msg("Afficher les pages")
            : msg("Afficher le texte accessible")}
        </button>
        <button
          type="button"
          className="button small"
          disabled={page <= 1}
          onClick={() => setPage((current) => current - 1)}
        >
          {msg("Page précédente")}
        </button>
        <span>{msg("Page {0} sur {1}", page, publication.source.pages)}</span>
        <button
          type="button"
          className="button small"
          disabled={page >= publication.source.pages}
          onClick={() => setPage((current) => current + 1)}
        >
          {msg("Page suivante")}
        </button>
      </div>
      <div className="secure-document-pages">
        {error ? (
          <ErrorNotice error={error} />
        ) : textMode && text !== undefined ? (
          <pre className="secure-document-accessible-text">
            {text ||
              msg("Aucun texte accessible n’est disponible pour cette page.")}
          </pre>
        ) : url ? (
          <figure className="secure-document-page">
            <img
              src={url}
              alt={msg("Page {0} du document partagé", page)}
              decoding="async"
            />
            <figcaption>{msg("Page {0}", page)}</figcaption>
          </figure>
        ) : (
          <Loading />
        )}
      </div>
    </section>
  );
}
