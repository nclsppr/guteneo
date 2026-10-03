import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProbeCredential,
  readProbeCredential,
  createProbeFetch,
  probeFailureMessage,
  PROBE_TOKEN_HEADER,
} from "../scripts/probe-credentials.mjs";

function temporaryCredential(context) {
  const directory = mkdtempSync(join(tmpdir(), "guteneo-probe-credential-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, path: join(directory, ".dev.vars") };
}

test("probe setup generates and rotates a 256-bit owner-private credential without returning it", (context) => {
  const { directory, path } = temporaryCredential(context);
  assert.equal(createProbeCredential(path), undefined);
  const first = readProbeCredential(path);
  assert.equal(/^[a-f0-9]{64}$/.test(first), true);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(createProbeCredential(path), undefined);
  const second = readProbeCredential(path);
  assert.equal(/^[a-f0-9]{64}$/.test(second), true);
  assert.notEqual(
    createHash("sha256").update(first).digest("hex"),
    createHash("sha256").update(second).digest("hex"),
  );
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(directory), [".dev.vars"]);
});

test("probe setup refuses foreign settings and credential reads reject exposed, missing, malformed or symlink files", (context) => {
  const { path, directory } = temporaryCredential(context);
  assert.throws(
    () => readProbeCredential(path),
    /LOCAL_PROBE_CREDENTIAL_REQUIRED/,
  );
  writeFileSync(path, "FOREIGN_SETTING=preserve-me\n", { mode: 0o600 });
  assert.throws(
    () => createProbeCredential(path),
    /LOCAL_PROBE_CREDENTIAL_SETUP_REFUSED/,
  );
  assert.equal(readFileSync(path, "utf8"), "FOREIGN_SETTING=preserve-me\n");
  assert.throws(
    () => readProbeCredential(path),
    /LOCAL_PROBE_CREDENTIAL_REQUIRED/,
  );
  rmSync(path);
  createProbeCredential(path);
  chmodSync(path, 0o644);
  assert.throws(
    () => readProbeCredential(path),
    /LOCAL_PROBE_CREDENTIAL_REQUIRED/,
  );
  assert.throws(
    () => createProbeCredential(path),
    /LOCAL_PROBE_CREDENTIAL_SETUP_REFUSED/,
  );
  chmodSync(path, 0o600);
  const link = join(directory, "linked.vars");
  symlinkSync(path, link);
  assert.throws(
    () => readProbeCredential(link),
    /LOCAL_PROBE_CREDENTIAL_REQUIRED/,
  );
  assert.throws(
    () => createProbeCredential(link),
    /LOCAL_PROBE_CREDENTIAL_SETUP_REFUSED/,
  );
});

test("probe transport authenticates GET and POST only on the selected loopback origin without redirects or cookies", async () => {
  const token = "a".repeat(64);
  const observations = [];
  const transport = createProbeFetch(
    "http://127.0.0.1:8891",
    token,
    async (url, options) => {
      observations.push({ url: url.href, options });
      return Response.json({ status: "stopped" });
    },
  );
  await transport("/state");
  await transport("/stop", {
    method: "POST",
    body: new Uint8Array(),
    headers: { "X-Extra": "preserved" },
  });
  assert.equal(observations.length, 2);
  for (const { options } of observations) {
    assert.equal(options.headers.get(PROBE_TOKEN_HEADER) === token, true);
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers.has("Origin"), false);
  }
  assert.equal(observations[1].options.headers.get("X-Extra"), "preserved");
  for (const destination of [
    "https://attacker.example/stop",
    "http://localhost:8891/stop",
    "http://127.0.0.1:9000/stop",
  ])
    assert.throws(() => transport(destination), /LOCAL_PROBE_ONLY/);
  assert.equal(observations.length, 2);
  assert.throws(
    () => createProbeFetch("https://guteneo.com", token),
    /LOCAL_PROBE_CONFIGURATION_REQUIRED/,
  );
  assert.throws(
    () => createProbeFetch("http://127.0.0.1:8891", "malformed"),
    /LOCAL_PROBE_CONFIGURATION_REQUIRED/,
  );
});

test("a real loopback redirect never transfers the private credential to another listener", async (context) => {
  let targetCalls = 0;
  let authenticatedSource = false;
  const token = "a".repeat(64);
  const target = createServer((_request, response) => {
    targetCalls++;
    response.end("unexpected");
  });
  const source = createServer((request, response) => {
    authenticatedSource =
      request.headers[PROBE_TOKEN_HEADER.toLowerCase()] === token;
    response.writeHead(302, {
      Location: `http://127.0.0.1:${target.address().port}/target`,
    });
    response.end();
  });
  for (const server of [target, source]) {
    context.after(() => {
      server.closeAllConnections();
      server.close();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  }
  const transport = createProbeFetch(
    `http://127.0.0.1:${source.address().port}`,
    token,
  );
  await assert.rejects(
    transport("/stop", { method: "POST", signal: AbortSignal.timeout(3000) }),
  );
  assert.equal(authenticatedSource, true);
  assert.equal(targetCalls, 0);
});

test("private failure messages redact a credential before it can enter a proof", () => {
  const token = "abc1".repeat(16);
  const message = probeFailureMessage(
    new Error(`Unexpected ${token} and ${token.toUpperCase()}`),
    token,
  );
  assert.equal(message.includes(token), false);
  assert.equal(message.includes(token.toUpperCase()), false);
  assert.equal(message, "Unexpected [redacted] and [redacted]");
  assert.equal(probeFailureMessage(null, token), "QUALIFICATION_FAILED");
});
