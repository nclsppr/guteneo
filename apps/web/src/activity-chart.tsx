import { useId, useState, type ReactNode } from "react";
import { msg } from "./messages";
import "./activity-chart.css";

export type ActivityMetric<Key extends string> = {
  key: Key;
  label: string;
  format: (value: number) => string;
};

/**
 * Daily bar chart with a metric switch and an equivalent data table for
 * assistive technology. Presentation only: it receives already authorized
 * rows and never reads data itself.
 */
export function ActivityChart<
  Key extends string,
  Row extends { date: string } & Record<Key, number>,
>({
  label,
  data,
  metrics,
  formatDate,
  empty,
}: {
  label: string;
  data: readonly Row[];
  metrics: readonly ActivityMetric<Key>[];
  formatDate: (date: string) => string;
  empty?: ReactNode;
}) {
  const id = useId();
  const [selected, setSelected] = useState<Key>(metrics[0].key);
  const [active, setActive] = useState<number | null>(null);
  const metric = metrics.find((item) => item.key === selected) ?? metrics[0];
  const values = data.map((row) => row[metric.key]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const top = Math.max(1, ...values);
  const width = 720,
    height = 180,
    gap = data.length > 60 ? 1 : 3;
  const bar = data.length ? width / data.length : width;
  const focused = active === null ? null : data[active];
  return (
    <div className="activity-chart">
      <div className="activity-chart-toolbar">
        <div
          className="activity-chart-metrics"
          role="group"
          aria-label={msg("Chart metric")}
        >
          {metrics.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={item.key === metric.key}
              onClick={() => {
                setSelected(item.key);
                setActive(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="activity-chart-total" aria-live="polite">
          <strong>{metric.format(total)}</strong>{" "}
          {focused
            ? msg(
                "{0} on {1}",
                metric.format(focused[metric.key]),
                formatDate(focused.date),
              )
            : msg("in this period")}
        </p>
      </div>
      {(!data.length || total === 0) && empty}
      {data.length > 0 && (
        <svg
          className="activity-chart-plot"
          viewBox={`0 0 ${width} ${height + 24}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          onMouseLeave={() => setActive(null)}
        >
          {[0.25, 0.5, 0.75, 1].map((tick) => (
            <line
              key={tick}
              x1={0}
              x2={width}
              y1={height - tick * height}
              y2={height - tick * height}
              className="activity-chart-grid"
            />
          ))}
          {data.map((row, index) => {
            const value = row[metric.key];
            const barHeight = value ? Math.max(2, (value / top) * height) : 0;
            return (
              <g key={row.date} onMouseEnter={() => setActive(index)}>
                <rect
                  x={index * bar}
                  y={0}
                  width={bar}
                  height={height}
                  className="activity-chart-hit"
                />
                <rect
                  x={index * bar + gap / 2}
                  y={height - barHeight}
                  width={Math.max(1, bar - gap)}
                  height={barHeight}
                  rx={Math.min(3, bar / 4)}
                  className={`activity-chart-bar${index === active ? " is-active" : ""}`}
                />
              </g>
            );
          })}
          <text x={0} y={height + 18} className="activity-chart-axis">
            {data[0] ? formatDate(data[0].date) : ""}
          </text>
          <text
            x={width}
            y={height + 18}
            textAnchor="end"
            className="activity-chart-axis"
          >
            {data.at(-1) ? formatDate(data.at(-1)!.date) : ""}
          </text>
        </svg>
      )}
      <details className="activity-chart-data">
        <summary>{msg("Show the data table")}</summary>
        <div
          className="activity-chart-table"
          role="region"
          aria-labelledby={`${id}-caption`}
          tabIndex={0}
        >
          <table>
            <caption id={`${id}-caption`}>{label}</caption>
            <thead>
              <tr>
                <th scope="col">{msg("Date")}</th>
                {metrics.map((item) => (
                  <th key={item.key} scope="col">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.date}>
                  <th scope="row">{formatDate(row.date)}</th>
                  {metrics.map((item) => (
                    <td key={item.key}>{item.format(row[item.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** A labelled figure: the vocabulary Belvédère and Administration share. */
export function StatTile({
  label,
  value,
  children,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
  tone?: "neutral" | "accent" | "warning";
  /** The list behind the figure, when there is one. */
  href?: string;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {children && <small>{children}</small>}
    </>
  );
  return href ? (
    <a className={`stat-tile stat-tile-${tone}`} href={href}>
      {content}
    </a>
  ) : (
    <div className={`stat-tile stat-tile-${tone}`}>{content}</div>
  );
}

/** Proportional horizontal bars for a small categorical breakdown. */
export function BreakdownBars({
  label,
  items,
  format,
}: {
  label: string;
  items: readonly {
    key: string;
    label: string;
    value: number;
    detail?: string;
  }[];
  format: (value: number) => string;
}) {
  const top = Math.max(1, ...items.map((item) => item.value));
  // One category has nothing to compare: show its figure without a full bar.
  const single = items.length === 1;
  return (
    <ul
      className={single ? "breakdown-bars breakdown-single" : "breakdown-bars"}
      aria-label={label}
    >
      {items.map((item) => (
        <li key={item.key}>
          <span className="breakdown-bars-label">{item.label}</span>
          <span className="breakdown-bars-track" aria-hidden="true">
            <span style={{ width: `${(item.value / top) * 100}%` }} />
          </span>
          <span className="breakdown-bars-value">
            {format(item.value)}
            {item.detail && <small>{item.detail}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
