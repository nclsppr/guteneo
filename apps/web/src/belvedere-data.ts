import { useEffect, useState } from "react";
import { bmsg } from "./belvedere-i18n";
import { formatLocale } from "./locale";
import type { BelvedereFilters } from "../../../packages/contracts/src/belvedere";

export const number = (value: number) =>
  new Intl.NumberFormat(formatLocale()).format(value);
export const money = (value: number | null, currency = "EUR") =>
  value === null
    ? bmsg("Non disponible")
    : new Intl.NumberFormat(formatLocale(), {
        style: "currency",
        currency,
      }).format(value / 100);
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
    ? new Intl.DateTimeFormat(formatLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : bmsg("Non renseigné");
};
export const shortDate = (value: string) => {
  const date = parsedDate(`${value.slice(0, 10)}T12:00:00Z`);
  return date
    ? new Intl.DateTimeFormat(formatLocale(), {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(date)
    : bmsg("Non renseigné");
};
export function countryName(code: string | null) {
  if (!code || code === "XX" || code === "T1")
    return bmsg("Pays non renseigné");
  try {
    return (
      new Intl.DisplayNames([formatLocale()], { type: "region" }).of(
        code.toUpperCase(),
      ) || code
    );
  } catch {
    return code;
  }
}
export const channelName = (channel: string) =>
  ({
    email: bmsg("Email"),
    fax: bmsg("Fax"),
    postal: bmsg("Courrier postal"),
    unknown: bmsg("Canal non conservé"),
  })[channel] || channel;
export const roleName = (role: string) =>
  ({
    admin: bmsg("Administrateur"),
    operator: bmsg("Opérateur"),
    member: bmsg("Opérateur"),
    supervisor: bmsg("Superviseur"),
    viewer: bmsg("Observateur"),
  })[role] || role;
export const statusName = (status: string) =>
  ({
    delivered: bmsg("Livré"),
    completed: bmsg("Terminé"),
    accepted: bmsg("Accepté"),
    queued: bmsg("En attente"),
    sending: bmsg("En cours"),
    submitted: bmsg("Transmis"),
    processing: bmsg("Traitement"),
    draft: bmsg("Brouillon"),
    prepared: bmsg("À approuver"),
    submitting: bmsg("Transmission"),
    printed: bmsg("Imprimé"),
    handed_to_post: bmsg("Remis à la poste"),
    reconciliation_required: bmsg("À rapprocher"),
    bounced: bmsg("Non distribué"),
    complained: bmsg("Plainte reçue"),
    failed: bmsg("Échec"),
    rejected: bmsg("Refusé"),
    unknown: bmsg("Résultat inconnu"),
    submission_unknown: bmsg("Résultat inconnu"),
    authorized: bmsg("Autorisée"),
    cancelled: bmsg("Annulé"),
    expired: bmsg("Expiré"),
    active: bmsg("Active"),
    revoked: bmsg("Révoquée"),
    pending: bmsg("En attente"),
    awaiting_approval: bmsg("À approuver"),
    approved: bmsg("Approuvé"),
    simulated: bmsg("Simulé"),
    paused: bmsg("Suspendu"),
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
