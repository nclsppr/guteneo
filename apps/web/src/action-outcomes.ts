import { getSessionAuthorityKey, subscribeSessionAuthority } from "./api";

export type ActionOutcomeKind =
  | "access_revoked"
  | "dispatch_prepared"
  | "dispatch_approved"
  | "quote_renewed"
  | "dispatch_cancelled"
  | "saved"
  | "updated"
  | "schedule_created"
  | "recipient_saved"
  | "webhook_saved"
  | "profile_saved";

/** A receipt reference only: never pass document text, recipients or remote URLs. */
export type ActionOutcome = {
  kind: ActionOutcomeKind;
  resourceId: string;
  route: string;
};
export type ActionOutcomeReceipt = Readonly<
  ActionOutcome & {
    id: string;
    observedAt: number;
  }
>;

const maximum = 20;
const lifetime = 15 * 60_000;
const empty: readonly ActionOutcomeReceipt[] = [];
const kinds = new Set<ActionOutcomeKind>([
  "access_revoked",
  "dispatch_prepared",
  "dispatch_approved",
  "quote_renewed",
  "dispatch_cancelled",
  "saved",
  "updated",
  "schedule_created",
  "recipient_saved",
  "webhook_saved",
  "profile_saved",
]);
let authority = getSessionAuthorityKey();
let receipts: readonly ActionOutcomeReceipt[] = empty;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleExpiry() {
  clearTimeout(timer);
  timer = undefined;
  if (!listeners.size || !receipts.length || typeof window === "undefined")
    return;
  const next = Math.min(...receipts.map((item) => item.observedAt + lifetime));
  timer = setTimeout(
    () => {
      const remaining = receipts.filter(
        (item) => item.observedAt + lifetime > Date.now(),
      );
      if (remaining.length !== receipts.length) {
        receipts = remaining.length ? remaining : empty;
        publish();
      } else scheduleExpiry();
    },
    Math.max(1, next - Date.now()),
  );
}
function publish() {
  scheduleExpiry();
  for (const listener of listeners) listener();
}
function reconcileAuthority() {
  const current = getSessionAuthorityKey();
  if (current === authority) return;
  authority = current;
  receipts = empty;
  publish();
}
subscribeSessionAuthority(reconcileAuthority);

export function subscribeActionOutcomes(listener: () => void) {
  listeners.add(listener);
  reconcileAuthority();
  scheduleExpiry();
  return () => {
    listeners.delete(listener);
    scheduleExpiry();
  };
}
export function getActionOutcomes(): readonly ActionOutcomeReceipt[] {
  return receipts;
}
export function getServerActionOutcomes(): readonly ActionOutcomeReceipt[] {
  return empty;
}
export function recordActionOutcome(
  value: ActionOutcome,
  actingAuthority: string,
): void {
  reconcileAuthority();
  if (
    !value ||
    actingAuthority !== authority ||
    !kinds.has(value.kind) ||
    typeof value.resourceId !== "string" ||
    typeof value.route !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(value.resourceId) ||
    value.route.length > 512 ||
    !/^\/app(?:\/[A-Za-z0-9_-]+)*$/.test(value.route)
  )
    return;
  const id = `${value.kind}:${value.route}:${value.resourceId}`;
  const now = Date.now();
  receipts = [
    Object.freeze({
      id,
      kind: value.kind,
      resourceId: value.resourceId,
      route: value.route,
      observedAt: now,
    }),
    ...receipts.filter(
      (item) => item.id !== id && item.observedAt + lifetime > now,
    ),
  ].slice(0, maximum);
  publish();
}
export function dismissActionOutcome(id: string) {
  const next = receipts.filter((item) => item.id !== id);
  if (next.length === receipts.length) return;
  receipts = next.length ? next : empty;
  publish();
}
export function clearActionOutcomes() {
  if (!receipts.length) return;
  receipts = empty;
  publish();
}
