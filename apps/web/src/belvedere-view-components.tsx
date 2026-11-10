import { type ReactNode } from "react";
import { StatTile } from "./activity-chart";
import {
  ArrowClockwise,
  ArrowRight,
  CaretLeft,
  CaretRight,
  ChartBar,
  CheckCircle,
  MagnifyingGlass,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { BelvedereFilters } from "../../../packages/contracts/src/belvedere";
import { BelvedereError, number, statusName } from "./belvedere-data";
import { bmsg } from "./belvedere-i18n";
import {
  belvedereCount,
  type BelvedereCountKind,
} from "./belvedere-presentation";

export type View =
  | "overview"
  | "workshops"
  | "members"
  | "jobs"
  | "connections"
  | "finance"
  | "infrastructure";

export type ViewProps = {
  basePath: string;
  filters: BelvedereFilters;
  revision: number;
  refresh: () => void;
};

export function Notice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "success";
}) {
  return (
    <div className={`bv-notice bv-notice-${tone}`}>
      {tone === "success" ? (
        <CheckCircle size={20} />
      ) : (
        <WarningCircle size={20} />
      )}
      <div>{children}</div>
    </div>
  );
}

export function Failure({
  error,
  retry,
  basePath,
}: {
  error: Error;
  retry: () => void;
  basePath: string;
}) {
  const expired =
    error instanceof BelvedereError &&
    (error.status === 401 || error.status === 403 || error.status === 404);
  return (
    <div className="bv-failure" role="alert">
      <WarningCircle size={28} />
      <h2>
        {expired
          ? bmsg("Your access needs to be checked.")
          : bmsg("The data could not be loaded.")}
      </h2>
      <p>
        {expired
          ? bmsg(
              "Your access to Belvédère has expired or is no longer authorised.",
            )
          : bmsg("Reading data failed. You can try again.")}
      </p>
      {expired ? (
        <a className="bv-button bv-button-primary" href={basePath}>
          {bmsg("Check my access")}
          <ArrowRight size={17} />
        </a>
      ) : (
        <button className="bv-button" onClick={retry}>
          <ArrowClockwise size={17} />
          {bmsg("Try again")}
        </button>
      )}
    </div>
  );
}

export function Loading({ table = false }: { table?: boolean }) {
  return (
    <div
      className={`bv-loading${table ? " bv-loading-table" : ""}`}
      role="status"
      aria-label={bmsg("Loading data")}
    >
      <span className="sr-only">{bmsg("Loading data…")}</span>
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bv-empty">
      <ChartBar size={27} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function SectionHeading({
  title,
  children,
  aside,
}: {
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="bv-section-heading">
      <div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {aside}
    </div>
  );
}

export function Stat({
  label,
  value,
  children,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <StatTile
      label={label}
      value={value}
      variant="plain"
      tone={accent ? "accent" : "neutral"}
      className={`bv-stat${accent ? " bv-stat-accent" : ""}`}
    >
      {children}
    </StatTile>
  );
}

export function Status({ value }: { value: string }) {
  const tone = [
    "failed",
    "unknown",
    "submission_unknown",
    "rejected",
    "bounced",
    "complained",
    "reconciliation_required",
  ].includes(value)
    ? "warning"
    : ["delivered", "completed", "active", "authorized"].includes(value)
      ? "success"
      : "neutral";
  return (
    <span className={`bv-status bv-status-${tone}`}>{statusName(value)}</span>
  );
}

export function Mode({ mode }: { mode: string }) {
  return (
    <span className={`bv-mode bv-mode-${mode}`}>
      {mode === "production"
        ? bmsg("Production")
        : mode === "simulation"
          ? bmsg("Simulation")
          : mode}
    </span>
  );
}

export function Pagination({
  data,
  onChange,
  kind = "results",
}: {
  data: { total: number; page: number; pageSize: number };
  onChange: (page: number) => void;
  kind?: BelvedereCountKind;
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="bv-pagination">
      <span>
        {data.total > 0
          ? bmsg(
              "{0}–{1} of {2}",
              number((data.page - 1) * data.pageSize + 1),
              number(Math.min(data.page * data.pageSize, data.total)),
              belvedereCount(kind, data.total),
            )
          : belvedereCount(kind, data.total)}
      </span>
      <div>
        <button
          className="bv-icon-button"
          aria-label={bmsg("Previous page")}
          disabled={data.page <= 1}
          onClick={() => onChange(data.page - 1)}
        >
          <CaretLeft size={17} />
        </button>
        <span>{bmsg("Page {0} of {1}", number(data.page), number(pages))}</span>
        <button
          className="bv-icon-button"
          aria-label={bmsg("Next page")}
          disabled={data.page >= pages}
          onClick={() => onChange(data.page + 1)}
        >
          <CaretRight size={17} />
        </button>
      </div>
    </div>
  );
}

export function Search({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="bv-search">
      <MagnifyingGlass size={18} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        maxLength={100}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label={bmsg("Clear search")}>
          <X size={15} />
        </button>
      )}
    </label>
  );
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "?"
  );
}
