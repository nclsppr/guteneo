/** A short, in-memory collection cache. Detail/readiness/approval models are
 * deliberately outside this allowlist and always read their current authority. */
export function cacheableListPath(path: string) {
  return /^\/(documents|senders|templates|datasets|mappings|generation-jobs|dispatches|campaigns|connections|secure-distributions)(?:\?|$)/.test(
    path,
  );
}

const TTL_MS = 5_000;
const MAX_ENTRIES = 64;
const MAX_VALUE_CHARACTERS = 32_768;
type Entry = {
  value?: unknown;
  expires: number;
  promise?: Promise<unknown>;
  controller?: AbortController;
  subscribers: number;
  generation: number;
};
const entries = new Map<string, Entry>();
let generation = 0;

/** A definitive refusal cannot leave an editable/readable stale private model. */
export function dataAfterReadFailure<T>(
  data: T | undefined,
  error: unknown,
): T | undefined {
  const status =
    error && typeof error === "object" && "status" in error
      ? error.status
      : undefined;
  return typeof status === "number" && [401, 403, 404, 410].includes(status)
    ? undefined
    : data;
}

/** Flush on all mutation attempts, including uncertain failures, and authority changes. */
export function invalidateClientLists(abort = false) {
  generation += 1;
  if (abort) for (const entry of entries.values()) entry.controller?.abort();
  entries.clear();
}

export function readClientList<T>(
  key: string,
  read: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  fresh = false,
): Promise<T> {
  signal.throwIfAborted();
  let entry = entries.get(key);
  if (fresh && entry && !entry.promise) {
    entries.delete(key);
    entry = undefined;
  }
  if (entry?.value !== undefined && entry.expires > Date.now())
    return Promise.resolve(entry.value as T);
  if (entry && !entry.promise) {
    entries.delete(key);
    entry = undefined;
  }
  if (!entry) {
    for (const [oldKey, old] of entries) {
      if (entries.size < MAX_ENTRIES) break;
      if (!old.promise && old.subscribers === 0) entries.delete(oldKey);
    }
    if (entries.size >= MAX_ENTRIES) return read(signal);
    const controller = new AbortController();
    const created: Entry = {
      expires: 0,
      controller,
      subscribers: 0,
      generation,
    };
    entry = created;
    entries.set(key, created);
    // Only unused settled entries may be evicted; a reader never loses another
    // reader's request merely because a different list opened.
    for (const [oldKey, old] of entries) {
      if (entries.size <= MAX_ENTRIES) break;
      if (!old.promise && old.subscribers === 0) entries.delete(oldKey);
    }
    created.promise = Promise.resolve()
      .then(() => read(controller.signal))
      .then((value) => {
        if (
          created.generation === generation &&
          !controller.signal.aborted &&
          (JSON.stringify(value)?.length ?? Infinity) <= MAX_VALUE_CHARACTERS
        ) {
          created.value = value;
          created.expires = Date.now() + TTL_MS;
        }
        return value;
      })
      .finally(() => {
        created.promise = undefined;
        created.controller = undefined;
        if (created.value === undefined && entries.get(key) === created)
          entries.delete(key);
      });
  }
  const owned = entry;
  owned.subscribers += 1;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return false;
      done = true;
      signal.removeEventListener("abort", abort);
      owned.subscribers -= 1;
      if (!owned.subscribers && owned.promise) {
        owned.controller?.abort();
        if (entries.get(key) === owned) entries.delete(key);
      }
      return true;
    };
    const abort = () => {
      if (finish())
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    owned.promise!.then(
      (value) => {
        if (finish()) resolve(value as T);
      },
      (error: unknown) => {
        if (finish()) reject(error);
      },
    );
  });
}
