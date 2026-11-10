import { useState } from "react";
import { ArrowDown, ArrowUpRight } from "@phosphor-icons/react";
import type { BelvedereOverview } from "../../../packages/contracts/src/belvedere";
import { channelName, countryName, money, number } from "./belvedere-data";
import { bmsg } from "./belvedere-i18n";
import { formatLocale } from "./locale";
import { Empty } from "./belvedere-view-components";
import { Status } from "./belvedere-view-components";

export function Countries({
  countries,
}: {
  countries: BelvedereOverview["countries"];
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...countries].sort((a, b) => b.connections - a.connections);
  const total = sorted.reduce((sum, item) => sum + item.connections, 0);
  const max = Math.max(...sorted.map((item) => item.connections), 1);
  if (!countries.length)
    return (
      <Empty title={bmsg("Geography is yet to be observed.")}>
        {bmsg(
          "Countries will appear with new connections. History without a country remains marked “unspecified”.",
        )}
      </Empty>
    );
  return (
    <div className="bv-countries">
      {sorted.slice(0, showAll ? undefined : 5).map((item) => (
        <div className="bv-country" key={item.country || "unknown"}>
          <span className="bv-country-code">{item.country || "—"}</span>
          <div>
            <span>
              {countryName(item.country)}
              <strong>{number(item.connections)}</strong>
              <small>
                {total
                  ? new Intl.NumberFormat(formatLocale(), {
                      style: "percent",
                      maximumFractionDigits: 1,
                    }).format(item.connections / total)
                  : new Intl.NumberFormat(formatLocale(), {
                      style: "percent",
                      maximumFractionDigits: 1,
                    }).format(0)}
              </small>
            </span>
            <div className="bv-country-track">
              <span style={{ width: `${(item.connections / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
      {sorted.length > 5 && (
        <button className="bv-text-button" onClick={() => setShowAll(!showAll)}>
          {showAll
            ? bmsg("Collapse list")
            : bmsg("View all {0} countries", number(sorted.length))}
          <ArrowDown size={15} />
        </button>
      )}
    </div>
  );
}

export function Channels({
  channels,
}: {
  channels: BelvedereOverview["channels"];
}) {
  const total = channels.reduce((sum, channel) => sum + channel.dispatches, 0);
  if (!channels.length)
    return (
      <Empty title={bmsg("No dispatches in this period.")}>
        {bmsg("The channel breakdown will appear after the first dispatches.")}
      </Empty>
    );
  return (
    <div className="bv-channels">
      <div
        className="bv-channel-stack"
        role="img"
        aria-label={channels
          .map((channel) =>
            bmsg(
              "{0}: {1} dispatches",
              channelName(channel.channel),
              number(channel.dispatches),
            ),
          )
          .join(", ")}
      >
        {channels.map((channel, index) => (
          <span
            key={channel.channel}
            className={`bv-channel-color-${index % 3}`}
            style={{
              width: `${total ? (channel.dispatches / total) * 100 : 0}%`,
            }}
          />
        ))}
      </div>
      <div className="bv-channel-head">
        <span>{bmsg("Channel")}</span>
        <span>{bmsg("Dispatches")}</span>
        <span>{bmsg("Consumption")}</span>
      </div>
      {channels.map((channel, index) => (
        <div className="bv-channel-row" key={channel.channel}>
          <span>
            <i className={`bv-channel-color-${index % 3}`} />
            {channelName(channel.channel)}
          </span>
          <strong>{number(channel.dispatches)}</strong>
          <strong>{money(channel.consumptionMinor)}</strong>
        </div>
      ))}
    </div>
  );
}

export function JobStatuses({
  statuses,
  onSelect,
}: {
  statuses: BelvedereOverview["statuses"];
  onSelect: (status: string) => void;
}) {
  const total = statuses.reduce((sum, item) => sum + item.dispatches, 0);
  const sorted = [...statuses].sort((a, b) => b.dispatches - a.dispatches);
  if (!total)
    return (
      <Empty title={bmsg("No dispatches to break down.")}>
        {bmsg(
          "Statuses will appear when dispatches are created in this period.",
        )}
      </Empty>
    );
  return (
    <div className="bv-job-states">
      {sorted.map((item) => (
        <button key={item.status} onClick={() => onSelect(item.status)}>
          <span>
            <Status value={item.status} />
            <strong>{number(item.dispatches)}</strong>
            <small>
              {new Intl.NumberFormat(formatLocale(), {
                style: "percent",
                maximumFractionDigits: 1,
              }).format(item.dispatches / total)}
            </small>
            <ArrowUpRight size={14} />
          </span>
          <span className="bv-job-state-track">
            <i
              className={`bv-job-state-${item.status}`}
              style={{ width: `${(item.dispatches / total) * 100}%` }}
            />
          </span>
        </button>
      ))}
    </div>
  );
}

export const jobStatuses = [
  "prepared",
  "queued",
  "submitting",
  "submission_unknown",
  "accepted",
  "delivered",
  "failed",
  "cancelled",
  "bounced",
  "complained",
  "printed",
  "handed_to_post",
];
