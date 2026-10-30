import { useId, useState, type FormEvent } from "react";
import { CaretDown, Flask, Shuffle } from "@phosphor-icons/react";
import { BEFORE_WORKSPACE_NAVIGATION, ErrorNotice } from "./components";
import { formatLocale, useLocale } from "./locale";
import { msg } from "./messages";
import {
  publicPreview,
  PREVIEW_ACCOUNTS,
  type PreviewAccount,
  type PreviewSimulationConfiguration,
} from "./preview";
import {
  PREVIEW_DATA_COLLECTIONS,
  type PreviewDataCounts,
} from "./preview-data";
import "./local-preview-controls.css";

export type PreviewVolume = "default" | "small" | "large" | "huge" | "extreme";
const limits = {
  small: [10, 50],
  large: [10_000, 100_000],
  huge: [100_000, 1_000_000],
  extreme: [1_000_000, 1_000_000_000],
} as const;

/** Counts are reproducible, bounded scalars; selecting a volume allocates no records. */
export function previewCountsForVolume(
  volume: PreviewVolume,
  seed: string,
): PreviewDataCounts | null {
  if (volume === "default") return null;
  const [minimum, maximum] = limits[volume];
  return Object.fromEntries(
    PREVIEW_DATA_COLLECTIONS.map((collection) => {
      let hash = 0x811c9dc5;
      const input = `${seed}\u0000${volume}\u0000${collection}`;
      for (let index = 0; index < input.length; index++)
        hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193);
      return [collection, minimum + ((hash >>> 0) % (maximum - minimum + 1))];
    }),
  ) as PreviewDataCounts;
}

function accountName(account: PreviewAccount) {
  return account === "belvedere"
    ? "Belvédère"
    : msg(
        {
          admin: "Administrator",
          supervisor: "Supervisor",
          member: "Operator",
          viewer: "Observer",
        }[account],
      );
}
const countNames = {
  documents: "Documents",
  dispatches: "Dispatches",
  templates: "Templates",
  datasets: "Datasets",
  generations: "Generations",
} as const;
function initialVolume(counts: PreviewDataCounts | null): PreviewVolume {
  if (!counts) return "default";
  const maximum = Math.max(...Object.values(counts));
  return maximum <= 50
    ? "small"
    : maximum <= 100_000
      ? "large"
      : maximum <= 1_000_000
        ? "huge"
        : "extreme";
}

/** Imported by the DEV loopback composition root only. All state stays in this tab. */
export function LocalPreviewControls({ onApplied }: { onApplied: () => void }) {
  useLocale();
  const id = useId();
  const [applied, setApplied] = useState(publicPreview.configuration);
  const [account, setAccount] = useState<PreviewAccount>(applied.account);
  const [volume, setVolume] = useState<PreviewVolume>(
    initialVolume(applied.counts),
  );
  const [seed, setSeed] = useState(applied.seed);
  const [counts, setCounts] = useState<PreviewDataCounts | null>(
    applied.counts,
  );
  const [expanded, setExpanded] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  const number = new Intl.NumberFormat(formatLocale());
  const compact = new Intl.NumberFormat(formatLocale(), {
    notation: "compact",
    maximumFractionDigits: 0,
  });
  const volumeName = (value: PreviewVolume) =>
    value === "default"
      ? msg("Interactive default")
      : `${msg({ small: "Small", large: "Large", huge: "Huge", extreme: "Extreme" }[value])} · ${msg("up to {0}", compact.format(limits[value][1]))}`;

  async function apply(nextSeed = seed, nextVolume = volume) {
    if (
      !window.dispatchEvent(
        new Event(BEFORE_WORKSPACE_NAVIGATION, { cancelable: true }),
      )
    )
      return;
    setPending(true);
    setError(undefined);
    try {
      const next: PreviewSimulationConfiguration = {
        account,
        seed: nextSeed,
        counts: previewCountsForVolume(nextVolume, nextSeed),
      };
      await publicPreview.configure(next);
      let actual = next.counts;
      if (!actual) {
        const overview = (await publicPreview.request("/overview")) as {
          documents: number;
          dispatches: { total: number };
        };
        actual = {
          documents: overview.documents,
          dispatches: overview.dispatches.total,
          templates: 0,
          datasets: 0,
          generations: 0,
        };
      }
      setApplied(next);
      setCounts(actual);
      setSeed(nextSeed);
      setVolume(nextVolume);
      onApplied();
    } catch {
      setError(
        new Error(msg("The local scenario could not be applied. Try again.")),
      );
    } finally {
      setPending(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void apply();
  }

  return (
    <details
      className="local-preview-controls"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <Flask size={18} aria-hidden="true" />
        <span>{msg("Local simulation")}</span>
        <span className="local-preview-controls__current">
          {accountName(applied.account)}
        </span>
        <CaretDown
          size={16}
          className="local-preview-controls__chevron"
          aria-hidden="true"
        />
      </summary>
      <div className="local-preview-controls__body">
        <form
          onSubmit={submit}
          aria-label={msg("Local simulation")}
          aria-busy={pending}
        >
          <fieldset disabled={pending}>
            <label htmlFor={`${id}-account`}>
              {msg("Demo account")}
              <select
                id={`${id}-account`}
                value={account}
                onChange={(event) =>
                  setAccount(event.target.value as PreviewAccount)
                }
              >
                {PREVIEW_ACCOUNTS.map((value) => (
                  <option value={value} key={value}>
                    {accountName(value)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-volume`}>
              {msg("Data volume")}
              <select
                id={`${id}-volume`}
                value={volume}
                onChange={(event) =>
                  setVolume(event.target.value as PreviewVolume)
                }
              >
                {(
                  ["default", "small", "large", "huge", "extreme"] as const
                ).map((value) => (
                  <option value={value} key={value}>
                    {volumeName(value)}
                  </option>
                ))}
              </select>
            </label>
            <label
              htmlFor={`${id}-seed`}
              className="local-preview-controls__seed"
            >
              {msg("Seed")}
              <input
                id={`${id}-seed`}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                required
                maxLength={128}
                pattern={".*\\S.*"}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="local-preview-controls__actions">
              <button className="button primary" type="submit">
                {msg("Apply scenario")}
              </button>
              <button
                className="button subtle"
                type="button"
                onClick={() =>
                  void apply(
                    crypto.randomUUID(),
                    volume === "default" ? "small" : volume,
                  )
                }
              >
                <Shuffle size={17} aria-hidden="true" />
                {msg("New random data")}
              </button>
            </div>
          </fieldset>
        </form>
        <p className="local-preview-controls__hint">
          {msg(
            "Generated volumes are virtual and read-only, with up to 50 rows per page; the default scenario stays interactive.",
          )}
        </p>
        {counts && (
          <dl
            className="local-preview-controls__counts"
            aria-label={msg("Scenario records")}
            aria-live="polite"
            aria-atomic="true"
          >
            {PREVIEW_DATA_COLLECTIONS.map((collection) => (
              <div key={collection}>
                <dt>{msg(countNames[collection])}</dt>
                <dd data-collection={collection}>
                  {number.format(counts[collection])}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <ErrorNotice error={error} />
      </div>
    </details>
  );
}

export default LocalPreviewControls;
