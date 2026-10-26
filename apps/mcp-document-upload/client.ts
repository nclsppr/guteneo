import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps/app-with-deps";
import type {
  McpAppUploadView,
  McpAppUploadBeginInput,
} from "../../packages/contracts/src/mcp-app-upload";
import {
  MCP_APP_UPLOAD_MAX_BYTES,
  MCP_APP_UPLOAD_PART_BYTES,
  MCP_APP_UPLOAD_MAX_PARTS,
  MCP_APP_UPLOAD_MAX_CALLS,
  MCP_APP_UPLOAD_TTL_SECONDS,
} from "../../packages/contracts/src/mcp-app-upload-limits";
import { messages, type Locale, type Message } from "./locales/index";

const app = new App({ name: "guteneo-private-original", version: "1" }, {});
const node = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = node<HTMLInputElement>("file"),
  review = node<HTMLInputElement>("review");
const buttons = {
  import: node<HTMLButtonElement>("import"),
  resume: node<HTMLButtonElement>("resume"),
  check: node<HTMLButtonElement>("check"),
  cancel: node<HTMLButtonElement>("cancel"),
  clear: node<HTMLButtonElement>("clear"),
};
let locale: Locale = "en",
  preferredLocale: Locale | undefined;
let phase: Message = "connecting",
  connected = false,
  opener = false;
let selected: File | undefined, original: Uint8Array<ArrayBuffer> | undefined;
let originalSize = 0,
  originalSha = "",
  selectionName = "";
let view: McpAppUploadView | undefined,
  attemptedBegin = false;
let beginInput: Readonly<McpAppUploadBeginInput> | undefined;
let operating = false,
  requestPending = false,
  cancelRequested = false,
  disposed = false;
let calls = 0,
  deadline = 0,
  nextCheckAt = 0,
  checks = 0,
  recoveryVerified = false;
let reported = "",
  contextFailed = false;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;
const expired = () => deadline !== 0 && Date.now() >= deadline;
const active = () =>
  !disposed && !expired() && document.visibilityState !== "hidden";
function releaseOriginal(clearInput = true) {
  original?.fill(0);
  original = undefined;
  selected = undefined;
  if (clearInput) input.value = "";
}
function localize(value?: string) {
  const language = (
    preferredLocale ??
    value ??
    document.documentElement.lang ??
    navigator.language
  )
    .toLowerCase()
    .split(/[-_]/)[0];
  locale = language in messages ? (language as Locale) : "en";
  document.documentElement.lang = locale;
  document.title = messages[locale].title;
  for (const element of document.querySelectorAll<HTMLElement>("[data-copy]"))
    element.textContent = messages[locale][element.dataset.copy as Message];
  render();
}
function render() {
  const copy = messages[locale],
    busy = operating || requestPending;
  node("status").textContent = phase === "choose" ? "" : copy[phase];
  node("selection").textContent = selectionName
    ? `${selectionName} · ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(originalSize / 1024 / 1024)} ${copy.unit}`
    : "";
  input.disabled = !connected || !opener || attemptedBegin || busy;
  node<HTMLButtonElement>("choose-file").disabled = input.disabled;
  node("selection-controls").hidden = attemptedBegin;
  review.disabled = !selected || attemptedBegin || busy;
  buttons.import.disabled =
    !connected ||
    !opener ||
    !selected ||
    !review.checked ||
    attemptedBegin ||
    busy;
  buttons.import.hidden = attemptedBegin;
  buttons.clear.hidden = !selected || attemptedBegin;
  buttons.clear.disabled = busy;
  buttons.resume.hidden = !(
    phase === "paused" &&
    recoveryVerified &&
    original &&
    active()
  );
  buttons.resume.disabled = busy || !connected;
  buttons.check.hidden =
    (!view && !beginInput) ||
    phase === "cancelled" ||
    phase === "rejected" ||
    phase === "purged" ||
    phase === "ready";
  buttons.check.disabled =
    busy ||
    !connected ||
    Date.now() < nextCheckAt ||
    calls >= MCP_APP_UPLOAD_MAX_CALLS ||
    (!view && expired());
  buttons.cancel.hidden =
    (!attemptedBegin && !operating) ||
    Boolean(view?.document) ||
    ["cancelled", "expired", "rejected"].includes(phase);
  buttons.cancel.disabled =
    cancelRequested || !connected || calls >= MCP_APP_UPLOAD_MAX_CALLS;
  node("progress").hidden = !view || Boolean(view.document);
  node("progress-label").hidden = !view || Boolean(view.document);
  const progress = node<HTMLProgressElement>("progress");
  progress.max = Math.max(originalSize, 1);
  progress.value = view?.receivedBytes ?? 0;
  node("receipt").hidden = !view?.document;
  node("document").textContent = view?.document?.id ?? "";
  node("context").hidden = !contextFailed;
  document.querySelector("main")?.setAttribute("aria-busy", String(busy));
}
function validateView(value: unknown): McpAppUploadView {
  if (
    !record(value) ||
    typeof value.uploadId !== "string" ||
    !/^upl_[a-f0-9-]{36}$/.test(value.uploadId) ||
    (view && value.uploadId !== view.uploadId)
  )
    throw new Error("Invalid receipt");
  if (
    ![
      "receiving",
      "finalizing",
      "complete",
      "cancelled",
      "expired",
      "rejected",
      "unknown",
    ].includes(String(value.status)) ||
    !["append_part", "wait", "finish", "get_document", "stop"].includes(
      String(value.nextAction),
    )
  )
    throw new Error("Invalid receipt");
  if (
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    (view && value.expiresAt !== view.expiresAt) ||
    value.partSize !== MCP_APP_UPLOAD_PART_BYTES ||
    value.partCount !== Math.ceil(originalSize / MCP_APP_UPLOAD_PART_BYTES)
  )
    throw new Error("Invalid receipt");
  if (
    !integer(value.partCount, 1, MCP_APP_UPLOAD_MAX_PARTS) ||
    !integer(value.remainingCalls, 0, MCP_APP_UPLOAD_MAX_CALLS) ||
    !Array.isArray(value.confirmedParts) ||
    value.confirmedParts.length > MCP_APP_UPLOAD_MAX_PARTS
  )
    throw new Error("Invalid receipt");
  const parts = value.confirmedParts;
  if (
    new Set(parts).size !== parts.length ||
    parts.some((index) => !integer(index, 0, Number(value.partCount) - 1))
  )
    throw new Error("Invalid receipt");
  if (
    (["receiving", "finalizing"].includes(String(value.status)) &&
      view?.confirmedParts.some((index) => !parts.includes(index))) ||
    (view && Number(value.remainingCalls) > view.remainingCalls)
  )
    throw new Error("Stale receipt");
  const received = parts.reduce(
    (sum, index) =>
      sum +
      Math.min(
        MCP_APP_UPLOAD_PART_BYTES,
        originalSize - Number(index) * MCP_APP_UPLOAD_PART_BYTES,
      ),
    0,
  );
  if (value.receivedBytes !== received || !integer(received, 0, originalSize))
    throw new Error("Invalid receipt");
  if (
    value.document !== undefined &&
    (!record(value.document) ||
      typeof value.document.id !== "string" ||
      !value.document.id ||
      value.document.id.length > 180 ||
      !["ready", "quarantined", "rejected", "purged"].includes(
        String(value.document.status),
      ) ||
      value.status !== "complete")
  )
    throw new Error("Invalid receipt");
  if (value.status === "complete" && !value.document)
    throw new Error("Invalid receipt");
  if (
    value.status === "receiving" &&
    value.nextAction === "finish" &&
    parts.length !== value.partCount
  )
    throw new Error("Invalid receipt");
  return value as unknown as McpAppUploadView;
}
async function call(name: string, args: Record<string, unknown>) {
  if (
    requestPending ||
    !connected ||
    disposed ||
    calls >= MCP_APP_UPLOAD_MAX_CALLS ||
    (view && view.remainingCalls <= 0)
  ) {
    if (calls >= MCP_APP_UPLOAD_MAX_CALLS || (view && view.remainingCalls <= 0))
      releaseOriginal();
    throw new Error("Call unavailable");
  }
  requestPending = true;
  calls++;
  render();
  try {
    const result = await app.callServerTool(
      { name, arguments: args },
      { timeout: 15_000 },
    );
    const envelope = result.structuredContent;
    if (result.isError || !record(envelope) || envelope.ok !== true) {
      // A definite refusal, including changed authority, cannot retain bytes for resume.
      releaseOriginal();
      recoveryVerified = false;
      throw new Error("Call not confirmed");
    }
    return validateView(envelope.data);
  } finally {
    requestPending = false;
    render();
  }
}
async function acceptReceipt(next: McpAppUploadView) {
  view = next;
  deadline = Math.min(deadline, Date.parse(next.expiresAt));
  if (next.document) {
    releaseOriginal();
    beginInput = undefined;
    phase =
      next.document.status === "ready"
        ? "ready"
        : next.document.status === "rejected"
          ? "documentRejected"
          : next.document.status === "purged"
            ? "purged"
            : "registered";
    const fingerprint = next.document.id + ":" + next.document.status;
    if (reported !== fingerprint) {
      try {
        await app.updateModelContext(
          {
            structuredContent: {
              documentId: next.document.id,
              status: next.document.status,
              size: originalSize,
              sha256: originalSha,
            },
          },
          { timeout: 5_000 },
        );
        reported = fingerprint;
        contextFailed = false;
      } catch {
        contextFailed = true;
      }
    }
  } else if (["cancelled", "expired", "rejected"].includes(next.status)) {
    phase = next.status as Message;
    releaseOriginal();
  } else if (next.status === "unknown" || next.nextAction === "stop") {
    phase = "stopped";
    recoveryVerified = false;
    const recoverablePart =
      next.status === "unknown" &&
      next.errorCode === "APP_PART_UNCONFIRMED" &&
      !expired() &&
      !cancelRequested &&
      connected &&
      calls < MCP_APP_UPLOAD_MAX_CALLS &&
      next.remainingCalls > 2;
    if (!recoverablePart) releaseOriginal();
    nextCheckAt = Math.max(nextCheckAt, Date.now() + 2000);
  } else if (next.status === "finalizing" || next.nextAction === "wait")
    phase = "paused";
  render();
}
const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
function encodePart(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
async function cancelUpload() {
  releaseOriginal();
  recoveryVerified = false;
  if (!view) {
    phase = attemptedBegin ? "uncertain" : "cancelled";
    render();
    return;
  }
  try {
    await acceptReceipt(
      await call("cancel_mcp_document_upload", { uploadId: view.uploadId }),
    );
  } catch {
    phase = "uncertain";
    render();
  }
}
async function transfer() {
  if (!original || !view || view.document || operating) return;
  operating = true;
  recoveryVerified = false;
  phase = "sending";
  render();
  try {
    while (view && original && !view.document) {
      if (cancelRequested) {
        await cancelUpload();
        break;
      }
      if (!active()) {
        phase = expired() ? "expired" : "paused";
        if (expired()) releaseOriginal();
        break;
      }
      if (
        view.status !== "receiving" ||
        !["append_part", "finish"].includes(view.nextAction)
      )
        break;
      if (calls >= MCP_APP_UPLOAD_MAX_CALLS - 2 || view.remainingCalls <= 2) {
        phase = "stopped";
        releaseOriginal();
        break;
      }
      const partIndex = Array.from(
        { length: view.partCount },
        (_, index) => index,
      ).find((index) => !view!.confirmedParts.includes(index));
      if (partIndex === undefined) {
        await acceptReceipt(
          await call("finish_mcp_document_upload", { uploadId: view.uploadId }),
        );
        break;
      }
      const part = original.slice(
        partIndex * view.partSize,
        Math.min((partIndex + 1) * view.partSize, originalSize),
      );
      try {
        const sha256 = await digest(part);
        if (cancelRequested || !active()) continue;
        const next = await call("append_mcp_document_upload", {
          uploadId: view.uploadId,
          partIndex,
          base64: encodePart(part),
          sha256,
        });
        if (
          !next.confirmedParts.includes(partIndex) &&
          next.status === "receiving" &&
          next.nextAction === "append_part"
        )
          throw new Error("Part not confirmed");
        await acceptReceipt(next);
      } finally {
        part.fill(0);
      }
    }
  } catch {
    phase = "uncertain";
    nextCheckAt = Date.now() + 2000;
  } finally {
    operating = false;
    render();
  }
  if (
    cancelRequested &&
    view &&
    !view.document &&
    !["cancelled", "expired", "rejected"].includes(view.status)
  )
    await cancelUpload();
}
node<HTMLButtonElement>("choose-file").onclick = () => {
  try {
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  } catch {
    phase = "unavailable";
    render();
  }
};
input.addEventListener("change", () => {
  if (attemptedBegin || operating) return;
  const files = input.files;
  const file = files?.length === 1 ? files[0] : undefined;
  releaseOriginal(false);
  review.checked = false;
  selectionName = "";
  originalSize = 0;
  // Metadata and the explicit exclusion review precede every file-content read.
  if (
    !(file instanceof File) ||
    !Number.isSafeInteger(file.size) ||
    file.size < 20 ||
    file.size > MCP_APP_UPLOAD_MAX_BYTES ||
    file.name.length > 180 ||
    !/^[^/\\\x00-\x1f\x7f]+\.pdf$/i.test(file.name) ||
    ![
      "",
      "application/pdf",
      "application/x-pdf",
      "application/octet-stream",
    ].includes(file.type)
  ) {
    input.value = "";
    phase = "invalid";
    render();
    return;
  }
  selected = file;
  originalSize = file.size;
  selectionName = file.name;
  phase = "selected";
  render();
});
review.addEventListener("change", render);
buttons.clear.onclick = () => {
  releaseOriginal();
  selectionName = "";
  originalSize = 0;
  review.checked = false;
  phase = "choose";
  render();
};
buttons.import.onclick = async () => {
  if (
    !selected ||
    !review.checked ||
    !connected ||
    !opener ||
    attemptedBegin ||
    operating
  )
    return;
  operating = true;
  phase = "hashing";
  cancelRequested = false;
  render();
  const file = selected;
  try {
    original = new Uint8Array(await file.arrayBuffer());
    if (
      original.length !== originalSize ||
      new TextDecoder().decode(original.subarray(0, 5)) !== "%PDF-"
    )
      throw new Error("Invalid original");
    originalSha = await digest(original);
    if (cancelRequested || disposed) {
      releaseOriginal();
      phase = "cancelled";
      return;
    }
    if (document.visibilityState === "hidden") {
      releaseOriginal();
      selectionName = "";
      originalSize = 0;
      review.checked = false;
      phase = "choose";
      return;
    }
    attemptedBegin = true;
    calls = 0;
    deadline = Date.now() + MCP_APP_UPLOAD_TTL_SECONDS * 1000;
    beginInput = Object.freeze({
      idempotencyKey: crypto.randomUUID(),
      fileName: file.name,
      size: originalSize,
      sha256: originalSha,
    });
    const next = await call("begin_mcp_document_upload", beginInput);
    await acceptReceipt(next);
  } catch {
    if (!attemptedBegin) releaseOriginal();
    phase = attemptedBegin ? "uncertain" : "invalid";
    nextCheckAt = Date.now() + 2000;
  } finally {
    operating = false;
    render();
  }
  if (cancelRequested) await cancelUpload();
  else await transfer();
};
buttons.resume.onclick = () => {
  if (recoveryVerified) void transfer();
};
buttons.check.onclick = async () => {
  if (
    (!view && (!beginInput || expired())) ||
    operating ||
    requestPending ||
    Date.now() < nextCheckAt ||
    disposed
  )
    return;
  operating = true;
  recoveryVerified = false;
  nextCheckAt = Date.now() + Math.min(8000, 2000 * 2 ** Math.min(checks++, 2));
  render();
  try {
    // Missing-ID recovery repeats immutable metadata only, never original content.
    await acceptReceipt(
      view
        ? await call("get_mcp_document_upload", { uploadId: view.uploadId })
        : await call("begin_mcp_document_upload", beginInput!),
    );
    if (cancelRequested) await cancelUpload();
    else if (
      original &&
      view?.status === "receiving" &&
      ["append_part", "finish"].includes(view.nextAction) &&
      active()
    ) {
      phase = "paused";
      recoveryVerified = true;
    }
  } catch {
    phase = "uncertain";
  } finally {
    operating = false;
    render();
  }
};
buttons.cancel.onclick = () => {
  cancelRequested = true;
  releaseOriginal();
  phase = "cancelling";
  render();
  if (!operating && !requestPending) void cancelUpload();
};
app.ontoolresult = (result) => {
  const envelope = result.structuredContent;
  if (
    !record(envelope) ||
    envelope.ok !== true ||
    !record(envelope.data) ||
    envelope.data.surface !== "guteneo-private-original-v1" ||
    !record(envelope.data.limits)
  )
    return;
  const limits = envelope.data.limits;
  opener =
    limits.maxBytes === MCP_APP_UPLOAD_MAX_BYTES &&
    limits.partBytes === MCP_APP_UPLOAD_PART_BYTES &&
    limits.maxParts === MCP_APP_UPLOAD_MAX_PARTS &&
    limits.maxCalls === MCP_APP_UPLOAD_MAX_CALLS &&
    limits.expiresWithinSeconds === MCP_APP_UPLOAD_TTL_SECONDS;
  if (
    typeof envelope.data.locale === "string" &&
    envelope.data.locale in messages
  )
    preferredLocale = envelope.data.locale as Locale;
  localize(app.getHostContext()?.locale);
  if (!opener) phase = "unavailable";
  else if (!attemptedBegin && !selected) phase = "choose";
  render();
};
function hostContext() {
  const context = app.getHostContext();
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
  localize(context?.locale);
}
app.onhostcontextchanged = hostContext;
app.onerror = () => {
  connected = false;
  recoveryVerified = false;
  phase = attemptedBegin ? "uncertain" : "unavailable";
  render();
};
app.onteardown = async () => {
  disposed = true;
  releaseOriginal();
  clearInterval(clock);
  // The server expiry/cleanup fence owns abandoned or in-flight staging.
  return {};
};
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "hidden" &&
    attemptedBegin &&
    !view?.document
  ) {
    recoveryVerified = false;
    if (!operating && !requestPending) phase = "paused";
    render();
  }
});
window.addEventListener("pagehide", () => {
  disposed = true;
  releaseOriginal();
  clearInterval(clock);
});
const clock = setInterval(() => {
  if (
    expired() &&
    !view?.document &&
    attemptedBegin &&
    !["cancelled", "rejected"].includes(phase)
  ) {
    releaseOriginal();
    recoveryVerified = false;
    phase = "expired";
  } else if (
    !view?.document &&
    (calls >= MCP_APP_UPLOAD_MAX_CALLS || view?.remainingCalls === 0)
  ) {
    releaseOriginal();
    recoveryVerified = false;
    phase = "stopped";
  }
  render();
}, 1000);
localize(navigator.language);
app
  .connect()
  .then(() => {
    connected =
      Boolean(app.getHostCapabilities()?.serverTools) &&
      window.isSecureContext &&
      typeof crypto.subtle?.digest === "function";
    hostContext();
    phase = connected ? (opener ? "choose" : "connecting") : "unavailable";
    render();
  })
  .catch(() => {
    phase = "unavailable";
    render();
  });
