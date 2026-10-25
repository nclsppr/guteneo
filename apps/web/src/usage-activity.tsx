import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type {
  UsageActivity,
  UsageActivityDay as ActivityDay,
} from "../../../packages/contracts/src/usage-activity";
import { money } from "./api";
import { ErrorNotice, Loading, useResource } from "./components";
import { formatLocale, useLocale } from "./locale";
import { msg } from "./messages";
import "./usage-activity.css";

const DAY = 86_400_000;
const zeroDay = { amountMinor: 0, dispatchCount: 0, chargeCount: 0 };

function calendarFor(year: number) {
  const first = Date.UTC(year, 0, 1);
  const length = (Date.UTC(year + 1, 0, 1) - first) / DAY;
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  const dates = Array.from({ length }, (_, index) =>
    new Date(first + index * DAY).toISOString().slice(0, 10),
  );
  return { dates, offset, weeks: Math.ceil((length + offset) / 7) };
}

function activityLevel(day: ActivityDay, maximum: number) {
  if (day.chargeCount === 0) return 0;
  if (day.amountMinor === 0 || maximum === 0) return 1;
  return Math.max(1, Math.ceil((day.amountMinor / maximum) * 4));
}

export function UsageActivityCalendar({
  refreshVersion = 0,
}: {
  refreshVersion?: number;
}) {
  useLocale();
  const id = useId();
  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [knownYears, setKnownYears] = useState<number[]>([]);
  const [selection, setSelection] = useState<{ year: number; date: string }>();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const { data, error, loading, refresh } = useResource<UsageActivity>(
    `/usage/activity?year=${year}`,
  );
  useEffect(() => {
    if (refreshVersion > 0) refresh();
  }, [refreshVersion, refresh]);
  useEffect(() => {
    if (data?.availableYears) setKnownYears(data.availableYears);
  }, [data?.availableYears]);

  const calendar = useMemo(() => calendarFor(year), [year]);
  const byDate = useMemo(
    () => new Map((data?.days ?? []).map((day) => [day.date, day])),
    [data?.days],
  );
  const maximum = useMemo(
    () => Math.max(0, ...(data?.days ?? []).map((day) => day.amountMinor)),
    [data?.days],
  );
  const asOf = data?.asOf.slice(0, 10) ?? "";
  const latestAvailable = calendar.dates
    .filter((value) => value <= asOf)
    .at(-1);
  const latestActive = data?.days
    .filter((day) => day.date <= asOf)
    .at(-1)?.date;
  const selectedDate =
    selection?.year === year && selection.date <= asOf
      ? selection.date
      : (latestActive ?? latestAvailable);
  const selectedDay = selectedDate
    ? { date: selectedDate, ...(byDate.get(selectedDate) ?? zeroDay) }
    : undefined;
  const years =
    data?.availableYears ?? (knownYears.length ? knownYears : [year]);
  const longDate = new Intl.DateTimeFormat(formatLocale(), {
    dateStyle: "full",
    timeZone: "UTC",
  });
  const monthDate = new Intl.DateTimeFormat(formatLocale(), {
    month: "short",
    timeZone: "UTC",
  });
  const weekdayDate = new Intl.DateTimeFormat(formatLocale(), {
    weekday: "short",
    timeZone: "UTC",
  });
  const dateLabel = (value: string) =>
    longDate.format(new Date(`${value}T00:00:00Z`));
  const operationLabel = (count: number) =>
    count === 1
      ? msg("{0} posted operation", count)
      : msg("{0} posted operations", count);
  const dayLabel = (day: ActivityDay) =>
    msg(
      "{0}: {1} consumed, {2}",
      dateLabel(day.date),
      money(day.amountMinor, "EUR"),
      operationLabel(day.chargeCount),
    );

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index;
    switch (event.key) {
      case "ArrowLeft":
        target -= 7;
        break;
      case "ArrowRight":
        target += 7;
        break;
      case "ArrowUp":
        target -= 1;
        break;
      case "ArrowDown":
        target += 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = calendar.dates.indexOf(latestAvailable ?? "");
        break;
      default:
        return;
    }
    event.preventDefault();
    target = Math.max(
      0,
      Math.min(target, calendar.dates.indexOf(latestAvailable ?? "")),
    );
    const value = calendar.dates[target];
    if (!value) return;
    setSelection({ year, date: value });
    buttons.current.get(value)?.focus();
  }

  return (
    <section
      className="usage-activity"
      aria-labelledby={`${id}-title`}
      aria-busy={loading}
    >
      <div className="usage-activity-heading">
        <div>
          <h2 id={`${id}-title`}>{msg("Daily activity")}</h2>
          <p>{msg("Your correspondence, one day at a time.")}</p>
        </div>
        <div className="usage-activity-year">
          <label htmlFor={`${id}-year`}>{msg("Activity year")}</label>
          <select
            id={`${id}-year`}
            value={year}
            disabled={loading}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <div className="usage-activity-error">
          <p>
            {msg(
              "Daily activity could not be loaded. Your monthly history remains available below.",
            )}
          </p>
          <ErrorNotice error={error} retry={refresh} focusOnError={false} />
        </div>
      ) : loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          {data.evidence === "simulation" ? (
            <p className="usage-activity-simulation">
              {msg("Simulation activity — these amounts are fictional.")}
            </p>
          ) : null}
          <p className="usage-activity-summary">
            <strong>{money(data.totals.amountMinor, data.currency)}</strong>
            <span>{msg("consumed in {0}", year)}</span>
            <span aria-hidden="true">·</span>
            <span>{operationLabel(data.totals.chargeCount)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {data.totals.activeDays === 1
                ? msg("{0} active day", data.totals.activeDays)
                : msg("{0} active days", data.totals.activeDays)}
            </span>
          </p>
          <p id={`${id}-instructions`} className="usage-activity-instructions">
            {msg(
              "Select a day to see its details. Use the arrow keys to move through the calendar.",
            )}
            <span className="usage-activity-scroll-hint">
              {" "}
              {msg("Scroll horizontally to explore the year.")}
            </span>
          </p>
          <div className="usage-activity-scroll">
            <div
              className="usage-activity-calendar"
              style={{ "--weeks": calendar.weeks } as CSSProperties}
            >
              <div className="usage-activity-months" aria-hidden="true">
                {Array.from({ length: 12 }, (_, month) => (
                  <span
                    key={month}
                    style={{
                      gridColumn:
                        Math.floor(
                          ((Date.UTC(year, month, 1) - Date.UTC(year, 0, 1)) /
                            DAY +
                            calendar.offset) /
                            7,
                        ) + 2,
                    }}
                  >
                    {monthDate.format(new Date(Date.UTC(year, month, 1)))}
                  </span>
                ))}
              </div>
              <div
                role="grid"
                aria-label={msg("Daily consumption in {0}", year)}
                aria-describedby={`${id}-instructions ${id}-source`}
                aria-rowcount={7}
                aria-colcount={calendar.weeks + 1}
              >
                {Array.from({ length: 7 }, (_, weekday) => (
                  <div
                    role="row"
                    className="usage-activity-weekday"
                    key={weekday}
                  >
                    <span role="rowheader">
                      {weekdayDate.format(
                        new Date(Date.UTC(2024, 0, 1 + weekday)),
                      )}
                    </span>
                    {Array.from({ length: calendar.weeks }, (_, week) => {
                      const index = week * 7 + weekday - calendar.offset;
                      const value = calendar.dates[index];
                      if (!value)
                        return (
                          <span role="gridcell" aria-hidden="true" key={week} />
                        );
                      const day = {
                        date: value,
                        ...(byDate.get(value) ?? zeroDay),
                      };
                      const future = value > asOf;
                      const label = future
                        ? msg("{0}: upcoming day", dateLabel(value))
                        : dayLabel(day);
                      return (
                        <span
                          role="gridcell"
                          key={week}
                          aria-selected={!future && value === selectedDate}
                        >
                          <button
                            type="button"
                            className="usage-activity-day"
                            data-date={value}
                            data-level={
                              future ? "future" : activityLevel(day, maximum)
                            }
                            disabled={future}
                            title={label}
                            aria-label={label}
                            aria-pressed={!future && value === selectedDate}
                            tabIndex={value === selectedDate ? 0 : -1}
                            ref={(node) => {
                              if (node) buttons.current.set(value, node);
                              else buttons.current.delete(value);
                            }}
                            onFocus={() => setSelection({ year, date: value })}
                            onClick={() => setSelection({ year, date: value })}
                            onKeyDown={(event) => moveFocus(event, index)}
                          />
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div
            className="usage-activity-key"
            aria-label={msg("Calendar legend")}
          >
            <span>{msg("No activity")}</span>
            <i data-level="0" aria-hidden="true" />
            <span className="usage-activity-key-divider" aria-hidden="true" />
            <span>{msg("Less")}</span>
            {[1, 2, 3, 4].map((level) => (
              <i key={level} data-level={level} aria-hidden="true" />
            ))}
            <span>{msg("More consumed")}</span>
          </div>
          {selectedDay ? (
            <div
              className="usage-activity-detail"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <h3>{dateLabel(selectedDay.date)}</h3>
              <dl>
                <div>
                  <dt>{msg("Daily consumption")}</dt>
                  <dd>{money(selectedDay.amountMinor, data.currency)}</dd>
                </div>
                <div>
                  <dt>{msg("Posted operations")}</dt>
                  <dd>{selectedDay.chargeCount}</dd>
                </div>
                <div>
                  <dt>{msg("Related dispatches")}</dt>
                  <dd>{selectedDay.dispatchCount}</dd>
                </div>
              </dl>
              {selectedDay.chargeCount === 0 ? (
                <p>{msg("No consumption recorded for this day.")}</p>
              ) : null}
            </div>
          ) : null}
          {data.totals.chargeCount === 0 ? (
            <p className="usage-activity-empty">
              {msg("No dated consumption recorded for this year.")}
            </p>
          ) : null}
          <p className="usage-activity-source" id={`${id}-source`}>
            {msg(
              "Posted debits, grouped by UTC day. Reservations and complimentary credit are excluded.",
            )}{" "}
            {msg(
              "Older totals without a date remain available in the monthly detail.",
            )}
          </p>
        </>
      ) : null}
    </section>
  );
}
