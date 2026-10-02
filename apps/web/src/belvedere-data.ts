import { useEffect, useState } from "react";
import type { BelvedereFilters } from "../../../packages/contracts/src/belvedere";

export const number = (value: number) =>
  new Intl.NumberFormat("fr-FR").format(value);
export const money = (value: number | null, currency = "EUR") =>
  value === null
    ? "Non disponible"
    : new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(
        value / 100,
      );
function parsedDate(value: string | null) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
export const dateTime = (value: string | null) => {
  const date = parsedDate(value);
  return date
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "Non renseigné";
};
export const shortDate = (value: string) => {
  const date = parsedDate(`${value.slice(0, 10)}T12:00:00Z`);
  return date
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(date)
    : "Non renseigné";
};
export function countryName(code: string | null) {
  if (!code || code === "XX" || code === "T1") return "Pays non renseigné";
  try {
    return (
      new Intl.DisplayNames(["fr"], { type: "region" }).of(
        code.toUpperCase(),
      ) || code
    );
  } catch {
    return code;
  }
}
export const channelName = (channel: string) =>
  ({
    email: "Email",
    fax: "Fax",
    postal: "Courrier postal",
    unknown: "Canal non conservé",
  })[channel] || channel;
export const roleName = (role: string) =>
  ({
    admin: "Administrateur",
    operator: "Opérateur",
    member: "Opérateur",
    supervisor: "Superviseur",
    viewer: "Observateur",
  })[role] || role;
export const statusName = (status: string) =>
  ({
    delivered: "Livré",
    completed: "Terminé",
    accepted: "Accepté",
    queued: "En attente",
    sending: "En cours",
    submitted: "Transmis",
    processing: "Traitement",
    draft: "Brouillon",
    prepared: "À approuver",
    submitting: "Transmission",
    printed: "Imprimé",
    handed_to_post: "Remis à la poste",
    reconciliation_required: "À rapprocher",
    bounced: "Non distribué",
    complained: "Plainte reçue",
    failed: "Échec",
    rejected: "Refusé",
    unknown: "Résultat inconnu",
    submission_unknown: "Résultat inconnu",
    authorized: "Autorisée",
    cancelled: "Annulé",
    expired: "Expiré",
    active: "Active",
    revoked: "Révoquée",
    pending: "En attente",
    awaiting_approval: "À approuver",
    approved: "Approuvé",
    simulated: "Simulé",
    paused: "Suspendu",
  })[status] || status.replaceAll("_", " ");
export function periodFilters(
  days: number,
  mode: BelvedereFilters["mode"],
): BelvedereFilters {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    mode,
  };
}
export function queryString(
  filters: BelvedereFilters,
  extra: Record<string, string | number> = {},
) {
  const query = new URLSearchParams({ ...filters });
  for (const [key, value] of Object.entries(extra))
    query.set(key, String(value));
  return query.toString();
}
export const BELVEDERE_ACCESS_EXPIRED = "guteneo:belvedere-access-expired";
export class BelvedereError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401 || status === 403 || status === 404
        ? "Votre accès à Belvédère a expiré ou n’est plus autorisé."
        : "La lecture des données a échoué. Vous pouvez réessayer.",
    );
  }
}
export function useBelvedereResource<T>(url: string | null, revision: number) {
  const key = `${url}:${revision}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: Error }>({
    key: "",
  });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new BelvedereError(response.status);
        if (!response.headers.get("content-type")?.includes("application/json"))
          throw new BelvedereError(401);
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          error instanceof BelvedereError &&
          [401, 403, 404].includes(error.status)
        )
          window.dispatchEvent(
            new CustomEvent(BELVEDERE_ACCESS_EXPIRED, { detail: error.status }),
          );
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              error instanceof Error
                ? error
                : new Error("La connexion a été interrompue."),
          });
      });
    return () => controller.abort();
  }, [url, key]);
  return state.key === key
    ? { ...state, loading: false }
    : { loading: !!url, data: undefined, error: undefined };
}
export function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
