import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const PROBE_TOKEN_HEADER = "X-Horizon-Qualification-Token";
export const PROBE_CREDENTIAL_PATH = fileURLToPath(
  new URL("../qualification/.dev.vars", import.meta.url),
);

/** Rotate the local-only credential before each run; never return or print it. */
export function createProbeCredential(path = PROBE_CREDENTIAL_PATH) {
  // A .dev.vars file may already contain unrelated operator settings. Rotate
  // only our exact, owner-private credential file; never destroy other data.
  try {
    lstatSync(path);
    readProbeCredential(path);
  } catch (error) {
    if (error?.code !== "ENOENT")
      throw new Error("LOCAL_PROBE_CREDENTIAL_SETUP_REFUSED");
  }
  const temporaryPath = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(
      descriptor,
      `HORIZON_QUALIFICATION_TOKEN=${randomBytes(32).toString("hex")}\n`,
    );
    closeSync(descriptor);
    descriptor = undefined;
    // Atomic replacement also preserves mode 0600 when an older file had a
    // different mode; no partially written credential is visible to Wrangler.
    renameSync(temporaryPath, path);
  } catch {
    throw new Error("LOCAL_PROBE_CREDENTIAL_SETUP_FAILED");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Successful rename removes the temporary file.
    }
  }
}

export function readProbeCredential(path = PROBE_CREDENTIAL_PATH) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      metadata.size > 1024 ||
      (metadata.mode & 0o077) !== 0 ||
      metadata.uid !== process.getuid()
    )
      throw new Error("UNSAFE_CREDENTIAL");
    const match = /^HORIZON_QUALIFICATION_TOKEN=([a-f0-9]{64})\n$/.exec(
      readFileSync(descriptor, "utf8"),
    );
    if (!match) throw new Error("INVALID_CREDENTIAL");
    return match[1];
  } catch {
    // Do not include file contents, paths, tokens or underlying OS errors.
    throw new Error(
      "LOCAL_PROBE_CREDENTIAL_REQUIRED: run setup-probe.mjs first",
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** Keep the credential on the selected loopback origin, including redirects. */
export function createProbeFetch(base, token, transport = fetch) {
  const url = new URL(base);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^[a-f0-9]{64}$/.test(token)
  )
    throw new Error("LOCAL_PROBE_CONFIGURATION_REQUIRED");
  return (path, options = {}) => {
    const destination = new URL(path, url);
    if (destination.origin !== url.origin) throw new Error("LOCAL_PROBE_ONLY");
    const headers = new Headers(options.headers);
    headers.set(PROBE_TOKEN_HEADER, token);
    return transport(destination, {
      ...options,
      headers,
      redirect: "error",
      credentials: "omit",
    });
  };
}

export function probeFailureMessage(error, token) {
  const message =
    error instanceof Error ? error.message : "QUALIFICATION_FAILED";
  return message
    .replaceAll(token, "[redacted]")
    .replaceAll(token.toUpperCase(), "[redacted]")
    .slice(0, 300);
}
