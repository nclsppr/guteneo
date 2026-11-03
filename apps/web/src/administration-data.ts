import { ApiError, money } from "./api";
import { useResource } from "./components";
import { formatLocale, getLocale } from "./locale";
import { msg } from "./messages";
import type {
  AdministrationExportDataset,
  AdministrationExportFormat,
} from "../../../packages/contracts/src/administration";

const DAY = 86_400_000;
export type Period = { from: string; to: string };
export const PERIOD_PRESETS = [7, 30, 90, 365] as const;

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);
export function presetPeriod(days: number, now = Date.now()): Period {
  return { from: isoDay(now - (days - 1) * DAY), to: isoDay(now) };
}
const validDay = (value: string | null): value is string =>
  !!value &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  isoDay(Date.parse(value)) === value;

export function validPeriod(period: Period): boolean {
  return (
    validDay(period.from) &&
    validDay(period.to) &&
    period.from <= period.to &&
    Date.parse(period.to) - Date.parse(period.from) <= 365 * DAY
  );
}

/** The period lives in the address, so reload and sharing keep the view. */
export function readPeriod(route: string): Period {
  const query = new URLSearchParams(route.split("?")[1]);
  const from = query.get("from"),
    to = query.get("to");
  if (from && to && validPeriod({ from, to })) return { from, to };
  return presetPeriod(30);
}
export function presetOf(period: Period) {
  return PERIOD_PRESETS.find((days) => {
    const preset = presetPeriod(days);
    return preset.from === period.from && preset.to === period.to;
  });
}
export function routeWith(
  path: string,
  values: Record<string, string | number | boolean | undefined | null>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      value !== false
    )
      query.set(key, String(value));
  return `${path}${query.size ? `?${query}` : ""}`;
}

export const count = (value: number) =>
  new Intl.NumberFormat(formatLocale()).format(value);
export const amount = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "—" : money(minor);
export const day = (value: string) =>
  new Intl.DateTimeFormat(formatLocale(), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
export const month = (value: string) =>
  new Intl.DateTimeFormat(formatLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00Z`));

/**
 * Download an export through the authenticated session. The file never
 * passes through a URL that could be shared or cached.
 */
export async function downloadExport(
  dataset: AdministrationExportDataset,
  format: AdministrationExportFormat,
  period: Period,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api${routeWith(`/administration/exports/${dataset}`, {
      format,
      locale: getLocale(),
      ...period,
    })}`,
    { credentials: "same-origin", headers: { Accept: "*/*" }, signal },
  );
  signal?.throwIfAborted();
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      failure?.error?.code ?? "HTTP_ERROR",
      failure?.error?.message ??
        msg("The service returned an error ({0}).", response.status),
      response.status,
    );
  }
  const name =
    /filename="([^"]+)"/.exec(
      response.headers.get("Content-Disposition") ?? "",
    )?.[1] ?? `guteneo-${dataset}.${format}`;
  const blob = await response.blob();
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noreferrer";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return name;
}

/** Report refreshes never keep metadata visible while authority is rechecked. */
export function useAdministrationResource<T>(path: string | null) {
  const resource = useResource<T>(path);
  return {
    ...resource,
    data: resource.loading || resource.error ? undefined : resource.data,
  };
}
