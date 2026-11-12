import { dispatchGroupOf } from "../../../packages/contracts/src/dispatch-groups";
import type { Channel, Dispatch } from "./api/types";
import type { FlapTone } from "./components/split-flap";
import type { Translate } from "./i18n";

/** The exact product status, in the reader's language. */
export function statusLabel(
  status: string,
  t: Translate,
  channel?: Channel,
): string {
  const specific =
    channel && status === "delivered"
      ? `traffic.status.delivered_${channel}`
      : `traffic.status.${status}`;
  const label = t(specific);
  if (label !== specific) return label;
  const generic = t(`traffic.status.${status}`);
  return generic === `traffic.status.${status}`
    ? status.replaceAll("_", " ").replaceAll(".", " · ")
    : generic;
}

/**
 * The short word a board cell can hold. The exact product status stays the
 * accessible text and the tooltip; this is only its station-board spelling.
 */
export function boardStatus(
  status: string,
  t: Translate,
  channel: Channel,
): string {
  for (const key of [
    `board.status.${status}_${channel}`,
    `board.status.${status}`,
  ]) {
    const label = t(key);
    if (label !== key) return label;
  }
  return statusLabel(status, t, channel);
}

export function boardTone(status: string): FlapTone {
  if (status === "cancelled") return "dim";
  switch (dispatchGroupOf(status)) {
    case "approval":
      return "signal";
    case "attention":
      return "danger";
    case "done":
      return "ok";
    default:
      return "ink";
  }
}

/** A held future dispatch reads as scheduled, whatever its stored status. */
export function presentedStatus(dispatch: Dispatch): string {
  return dispatch.activeSchedule ? "scheduled" : dispatch.status;
}
