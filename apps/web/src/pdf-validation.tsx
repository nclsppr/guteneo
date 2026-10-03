import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight } from "@phosphor-icons/react";
import {
  api,
  ApiError,
  date,
  isPublicPreview,
  type DocumentRecord,
} from "./api";
import {
  ErrorNotice,
  Field,
  Loading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import type { HorizonPlan } from "./horizon-plan";
import { msg } from "./messages";
import "./horizon.css";
import {
  pdfValidationProfiles,
  type PdfValidationProfile,
  type PdfValidationReport,
} from "../../../packages/contracts/src/pdf-validation";

export const PDF_VALIDATION_PROFILES = pdfValidationProfiles;
export type { PdfValidationProfile, PdfValidationReport };
export const PDF_PROFILE_NAMES: Record<PdfValidationProfile, string> = {
  ua1: "PDF/UA-1",
  ua2: "PDF/UA-2",
  "1b": "PDF/A-1b",
  "2b": "PDF/A-2b",
  "3b": "PDF/A-3b",
  "4": "PDF/A-4",
};
export function pdfManualCheckLabel(
  id: PdfValidationReport["manualChecks"][number]["id"],
) {
  return {
    reading_order: msg("Vérifier l’ordre de lecture avec un lecteur d’écran"),
    alternative_text: msg("Vérifier la pertinence des textes alternatifs"),
    visual_contrast: msg("Vérifier les contrastes et la lisibilité"),
    keyboard_navigation: msg(
      "Vérifier la navigation au clavier et les formulaires",
    ),
  }[id];
}

export function exportPdfValidationReport(report: PdfValidationReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `guteneo-${report.profile}-${report.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PdfValidation({
  document,
  canValidate,
}: {
  document: DocumentRecord;
  canValidate: boolean;
}) {
  const id = useId();
  const plan = useResource<HorizonPlan>("/plan");
  // Reports are tenant-scoped history. Reading them never starts a validator.
  const reports = useResource<{ items: PdfValidationReport[] }>(
    isPublicPreview
      ? null
      : `/documents/${encodeURIComponent(document.id)}/validation`,
  );
  const action = useAction();
  const [profile, setProfile] = useState<PdfValidationProfile>("ua1");
  const [result, setResult] = useState<PdfValidationReport>();
  const requestKey = useRef<{
    profile: PdfValidationProfile;
    key: string;
  } | null>(null);
  const enabled = plan.data?.enabled === true && !isPublicPreview;
  const entitled = plan.data?.entitled === true;
  const ready = document.status === "ready";
  const canRun = enabled && entitled && ready && canValidate;
  const items = result
    ? [
        result,
        ...(reports.data?.items ?? []).filter((item) => item.id !== result.id),
      ]
    : (reports.data?.items ?? []);
  async function validate(event: FormEvent) {
    event.preventDefault();
    if (!canRun || action.pending) return;
    await action.run(async () => {
      if (!requestKey.current || requestKey.current.profile !== profile)
        requestKey.current = { profile, key: crypto.randomUUID() };
      let report: PdfValidationReport;
      try {
        report = await api<PdfValidationReport>(
          `/documents/${encodeURIComponent(document.id)}/validation`,
          { method: "POST", key: requestKey.current.key, body: { profile } },
        );
      } catch (error) {
        // A known terminal failure may be checked again on an explicit action.
        // Network uncertainty keeps the key so that replay cannot double-run.
        if (error instanceof ApiError && error.code === "PDF_VALIDATION_FAILED")
          requestKey.current = null;
        throw error;
      }
      requestKey.current = null;
      setResult(report);
      reports.refresh();
    });
  }
  return (
    <section
      className="pdf-validation"
      aria-labelledby={`${id}-title`}
      aria-busy={action.pending}
    >
      <div className="section-toolbar">
        <h3 id={`${id}-title`}>{msg("Accessibilité et archivage du PDF")}</h3>
        <RefreshButton
          onClick={() => {
            plan.refresh();
            reports.refresh();
          }}
          disabled={action.pending || reports.loading}
        />
      </div>
      <p>
        {msg(
          "PDF/UA contrôle les règles techniques d’accessibilité. PDF/A contrôle la conservation à long terme : un PDF/A n’est pas nécessairement accessible.",
        )}
      </p>
      <p>
        {msg(
          "Le contrôle utilise le PDF original et conserve son empreinte. Il ne modifie pas le document et ne corrige pas automatiquement les erreurs.",
        )}
      </p>
      <ErrorNotice error={plan.error ?? reports.error ?? action.error} />
      {plan.loading && !plan.data && <Loading />}
      {plan.data && !enabled && (
        <p className="notice info">
          {msg(
            "Cette offre est en préparation. La souscription et les contrôles PDF seront ouverts après activation du service.",
          )}
        </p>
      )}
      {enabled && !entitled && (
        <p>
          {msg(
            "Ce contrôle est inclus dans le forfait Horizon à 30 € par mois.",
          )}
        </p>
      )}
      {!canRun && (
        <a className="text-link" href="#/app/plan">
          {msg("Découvrir le forfait Horizon")}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      )}
      {enabled && entitled && !ready && (
        <p className="notice info">
          {msg(
            "Le PDF doit d’abord terminer sa vérification de sécurité avant un contrôle d’accessibilité ou d’archivage.",
          )}
        </p>
      )}
      {enabled && entitled && !canValidate && (
        <p>
          {msg(
            "Votre rôle permet de consulter les rapports. Demandez à un membre autorisé de lancer un contrôle.",
          )}
        </p>
      )}
      {canRun && (
        <form
          onSubmit={(event) => void validate(event)}
          className="pdf-validation-form"
        >
          <Field
            label={msg("Profil de validation")}
            hint={msg("Choisissez le standard attendu pour votre document.")}
          >
            <select
              value={profile}
              onChange={(event) =>
                setProfile(event.target.value as PdfValidationProfile)
              }
              disabled={action.pending}
            >
              {PDF_VALIDATION_PROFILES.map((value) => (
                <option key={value} value={value}>
                  {PDF_PROFILE_NAMES[value]}
                </option>
              ))}
            </select>
          </Field>
          <button className="button primary" disabled={action.pending}>
            {action.pending
              ? msg("Contrôle en cours…")
              : msg("Contrôler ce PDF")}
          </button>
          <p id={`${id}-progress`} role="status">
            {action.pending
              ? msg(
                  "Le contrôle est en cours. Le résultat portera uniquement sur ce PDF et ce profil.",
                )
              : msg(
                  "Le résultat automatique doit être complété par une revue humaine.",
                )}
          </p>
        </form>
      )}
      {!reports.loading && reports.data && !items.length && (
        <p className="horizon-limit">
          {msg("Aucun rapport de validation pour ce PDF.")}
        </p>
      )}
      <div className="pdf-validation-reports" aria-live="polite">
        {items.map((report) => (
          <PdfReport key={report.id} report={report} document={document} />
        ))}
      </div>
    </section>
  );
}

export function PdfReport({
  report,
  document,
}: {
  report: PdfValidationReport;
  document: Pick<DocumentRecord, "id" | "sha256">;
}) {
  // Never display evidence for a different source as this document's result.
  if (report.documentId !== document.id || report.sha256 !== document.sha256)
    return (
      <p className="notice error" role="alert">
        {msg(
          "Ce rapport ne correspond pas à l’empreinte du document affiché. Actualisez les rapports.",
        )}
      </p>
    );
  const passing = report.compliant && report.status === "passed";
  return (
    <article className="pdf-validation-report">
      <div className="section-toolbar">
        <h4>{PDF_PROFILE_NAMES[report.profile]}</h4>
        <span
          className={`status ${passing ? "status-document-ready" : "status-document-blocked"}`}
        >
          {passing
            ? msg("Contrôles automatiques réussis")
            : msg("Écarts techniques détectés")}
        </span>
      </div>
      <p>
        {date(report.createdAt)} · {report.engine.name} {report.engine.version}
      </p>
      {report.evidence === "simulation" && (
        <p className="notice info">
          {msg(
            "Rapport de simulation : il ne prouve pas la conformité du PDF.",
          )}
        </p>
      )}
      <dl className="pdf-report-counts">
        <div>
          <dt>{msg("Règles réussies")}</dt>
          <dd>{report.passedRules}</dd>
        </div>
        <div>
          <dt>{msg("Règles en échec")}</dt>
          <dd>{report.failedRules}</dd>
        </div>
        <div>
          <dt>{msg("Contrôles en échec")}</dt>
          <dd>{report.failedChecks}</dd>
        </div>
      </dl>
      {report.findings.length > 0 && (
        <div
          className="table-scroll"
          role="region"
          aria-label={msg("Références des règles à corriger")}
          tabIndex={0}
        >
          <table>
            <caption>{msg("Références des règles à corriger")}</caption>
            <thead>
              <tr>
                <th scope="col">{msg("Spécification")}</th>
                <th scope="col">{msg("Clause / test")}</th>
                <th scope="col">{msg("Contrôles en échec")}</th>
              </tr>
            </thead>
            <tbody>
              {report.findings.map((finding, index) => (
                <tr
                  key={`${finding.specification}-${finding.clause}-${finding.testNumber}-${index}`}
                >
                  <td>{finding.specification}</td>
                  <td>
                    {finding.clause} / {finding.testNumber}
                  </td>
                  <td>{finding.failedChecks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report.truncated && (
        <p>
          {msg(
            "La liste affichée est limitée. Le nombre total d’échecs reste indiqué dans le rapport.",
          )}
        </p>
      )}
      <details>
        <summary>{msg("Revue humaine à compléter")}</summary>
        <p>
          {msg(
            "Ces points restent à vérifier manuellement. Guteneo n’enregistre pas ici d’attestation de revue humaine.",
          )}
        </p>
        <ul>
          {report.manualChecks.map((check) => (
            <li key={check.id}>{pdfManualCheckLabel(check.id)}</li>
          ))}
        </ul>
      </details>
      <p className="horizon-limit">
        {msg(
          "Un résultat technique favorable n’est ni une certification d’accessibilité ni une garantie de conformité légale.",
        )}
      </p>
      <p className="pdf-report-hash">
        <span>SHA-256</span>
        <code>{report.sha256}</code>
      </p>
      <button
        className="button small"
        type="button"
        onClick={() => exportPdfValidationReport(report)}
      >
        {msg("Exporter le rapport JSON")}
        <ArrowDown size={17} aria-hidden="true" />
      </button>
    </article>
  );
}
