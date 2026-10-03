import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the actual subclass while replacing only Cloudflare's host runtime.
// The readiness promise is deliberately held while the idle callback fires.
const source = readFileSync(
  new URL("../src/index.ts", import.meta.url),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    'import { Container } from "@cloudflare/containers";',
    `
class Container {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.stops = 0; this.renewals = 0; this.forwards = 0; }
  async getState() { return { status: this.ctx.container.running ? "healthy" : "stopped" }; }
  async startAndWaitForPorts(port, options) {
    this.startOptions = options; this.startPort = port;
    this.ctx.entered();
    await this.ctx.ready;
    this.ctx.container.running = true;
  }
  async containerFetch() { this.forwards++; return Response.json({ status: "ready" }); }
  renewActivityTimeout() { this.renewals++; }
  async stop() { this.stops++; this.ctx.container.running = false; }
}
`,
  )
  .replace(
    'import { handleRequest } from "./handler";',
    "const handleRequest = async () => new Response();",
  )
  .replace('export { ValidatorQualification } from "./qualification";', "");
const { PdfValidatorContainer } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("idle expiry cannot stop a container while a cold request waits for readiness", async () => {
  const ready = deferred();
  const entered = deferred();
  const ctx = {
    container: { running: false },
    ready: ready.promise,
    entered: entered.resolve,
  };
  const container = new PdfValidatorContainer(ctx, {
    QUALIFICATION_ENABLED: "false",
  });
  const request = new Request("http://validator.internal/health");
  const response = container.fetch(request);
  await entered.promise;
  assert.equal(container.startPort, 8080);
  assert.equal(container.startOptions.abort, request.signal);
  assert.equal(container.startOptions.portReadyTimeoutMS, 35000);
  await container.onActivityExpired();
  await container.onActivityExpired();
  assert.equal(container.stops, 0);
  assert.equal(container.forwards, 0);
  assert.equal(container.renewals, 2);
  ready.resolve();
  assert.equal((await response).status, 200);
  assert.equal(container.forwards, 1);
  assert.equal(container.renewals, 3);
  await container.onActivityExpired();
  assert.equal(container.stops, 1);
});

test("failed cold startup releases admission and allows a later idle stop without retry", async () => {
  const ready = deferred();
  const entered = deferred();
  const container = new PdfValidatorContainer(
    {
      container: { running: false },
      ready: ready.promise,
      entered: entered.resolve,
    },
    {},
  );
  const response = container.fetch(
    new Request("http://validator.internal/health"),
  );
  await entered.promise;
  await container.onActivityExpired();
  assert.equal(container.stops, 0);
  ready.reject(new Error("synthetic private startup error"));
  assert.deepEqual(await (await response).json(), {
    code: "VALIDATOR_UNAVAILABLE",
  });
  assert.equal(container.forwards, 0);
  await container.onActivityExpired();
  assert.equal(container.stops, 1);
});
