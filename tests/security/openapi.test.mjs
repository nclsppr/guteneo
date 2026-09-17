import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";

const spec = JSON.parse(
  await readFile(
    new URL("../../apps/web/public/openapi.json", import.meta.url),
    "utf8",
  ),
);
const api = await readFile(
  new URL("../../apps/api/src/index.ts", import.meta.url),
  "utf8",
);
const auth = await readFile(
  new URL("../../apps/api/src/auth.ts", import.meta.url),
  "utf8",
);
const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({
    path,
    method,
    operation,
  })),
);

test("OpenAPI is valid, self-contained and never resolves a remote document", async () => {
  await SwaggerParser.validate(structuredClone(spec), {
    resolve: { external: false },
  });
  assert.equal(spec.openapi, "3.0.3");
  function inspect(value) {
    if (!value || typeof value !== "object") return;
    if (value.$ref) assert.match(value.$ref, /^#\/components\//);
    for (const child of Object.values(value)) inspect(child);
  }
  inspect(spec);
  assert.equal(operations.length, 23);
  assert.equal(
    new Set(operations.map(({ operation }) => operation.operationId)).size,
    operations.length,
  );
});

test("documented routes exist and OAuth cannot acquire browser approval or private account operations", () => {
  const expected = new Set([
    "get /api/health",
    "get /api/capabilities",
    "get /api/documents",
    "post /api/documents",
    "post /api/documents/render",
    "get /api/documents/{id}/content",
    "post /api/documents/{id}/rescan",
    "get /api/dispatches",
    "post /api/dispatches",
    "get /api/dispatches/{id}",
    "post /api/dispatches/{id}/confirm",
    "post /api/dispatches/{id}/cancel",
    "get /api/campaigns",
    "post /api/campaigns",
    "get /api/campaigns/{id}",
    "post /api/recipients/validate",
    "get /api/senders",
    "get /api/usage",
    "post /api/postal/preflights",
    "get /api/postal/preflights/{id}",
    "get /api/postal/preflights/{id}/address.png",
    "post /api/postal/preflights/{id}/quote",
    "get /api/postal/requirements",
  ]);
  assert.deepEqual(
    new Set(operations.map(({ path, method }) => `${method} ${path}`)),
    expected,
  );
  for (const { path, method, operation } of operations) {
    assert.ok(
      api.includes(`app.${method}("${path.replaceAll("{id}", ":id")}"`),
      `${method} ${path} must exist in router`,
    );
    assert.doesNotMatch(
      path,
      /approve|transfer|admin|billing|session|webhooks|documents\/import/,
    );
    const publicRoute = ["/api/health", "/api/capabilities"].includes(path);
    const scope =
      path.startsWith("/api/documents") ||
      (path.startsWith("/api/postal") && method === "get")
        ? method === "get"
          ? "documents:read"
          : "documents:write"
        : /\/(confirm|cancel)$/.test(path)
          ? "dispatches:send"
          : method === "get"
            ? "dispatches:read"
            : "dispatches:prepare";
    assert.deepEqual(
      operation.security,
      publicRoute
        ? []
        : [
            {
              GuteneoOAuth:
                path === "/api/postal/preflights"
                  ? ["documents:write", "dispatches:prepare"]
                  : [scope],
            },
          ],
    );
  }
  assert.match(
    spec.paths["/api/dispatches/{id}/confirm"].post.description,
    /navigateur/,
  );
  assert.match(
    spec.paths["/api/dispatches/{id}"].get.description,
    /Ne jamais recréer automatiquement/,
  );
});

test("OAuth publishes the real audience and five scopes without fictitious API keys", () => {
  assert.deepEqual(Object.keys(spec.components.securitySchemes), [
    "GuteneoOAuth",
  ]);
  const oauth = spec.components.securitySchemes.GuteneoOAuth;
  assert.equal(oauth.type, "oauth2");
  assert.equal(oauth["x-audience"], "https://guteneo.com/mcp");
  assert.equal(oauth["x-pkce-method"], "S256");
  assert.equal(oauth["x-pkce-required"], true);
  assert.equal(
    oauth.flows.authorizationCode.authorizationUrl,
    "https://pieper.eu.auth0.com/authorize",
  );
  assert.equal(
    oauth.flows.authorizationCode.tokenUrl,
    "https://pieper.eu.auth0.com/oauth/token",
  );
  const actualScopes = [
    ...auth
      .match(/export const MCP_SCOPES = \[([\s\S]*?)\]/)[1]
      .matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    Object.keys(oauth.flows.authorizationCode.scopes).sort(),
    actualScopes.sort(),
  );
});

test("wire contracts retain integer prices, JSON strings, quarantine and required idempotency", () => {
  const { schemas } = spec.components;
  assert.equal(schemas.Dispatch.properties.recipient_json.type, "string");
  assert.equal(schemas.Dispatch.properties.options_json.type, "string");
  for (const field of ["estimated_minor", "ceiling_minor", "known_minor"])
    assert.equal(schemas.Dispatch.properties[field].type, "integer");
  assert.deepEqual(schemas.Dispatch.properties.currency.enum, ["EUR"]);
  assert.equal(schemas.DispatchDetail.properties.approval.nullable, true);
  assert.equal(schemas.Document.properties.pages.minimum, 0);
  assert.ok(schemas.Document.properties.status.enum.includes("quarantined"));
  assert.equal(schemas.PrepareDispatch.additionalProperties, false);
  assert.ok(!("organizationId" in schemas.PrepareDispatch.properties));
  assert.ok(!("approvalUrl" in schemas.Dispatch.properties));
  assert.ok(!("fingerprint" in schemas.PrepareDispatch.properties));
  const requiredKeys = operations
    .filter(({ operation }) =>
      operation.parameters?.some((parameter) =>
        parameter.$ref?.endsWith("/IdempotencyKey"),
      ),
    )
    .map(({ path, method }) => `${method} ${path}`);
  assert.deepEqual(requiredKeys, [
    "post /api/dispatches",
    "post /api/dispatches/{id}/confirm",
    "post /api/postal/preflights",
    "post /api/postal/preflights/{id}/quote",
  ]);
  assert.equal(spec.components.parameters.IdempotencyKey.required, true);
  assert.equal(
    spec.paths["/api/documents/{id}/content"].get.responses["200"].content[
      "application/pdf"
    ].schema.format,
    "binary",
  );
  assert.ok(spec.paths["/api/documents/{id}/content"].get.responses["423"]);
  for (const field of ["quote_customer_nanoeur"]) {
    assert.equal(schemas.Dispatch.properties[field].type, "integer");
    assert.equal(schemas.Dispatch.properties[field].nullable, true);
    assert.ok(
      !schemas.Dispatch.required.includes(field),
      "list responses may omit quote projections",
    );
    assert.ok(
      !(field in schemas.PrepareDispatch.properties),
      "the client cannot supply its own price",
    );
  }
  assert.equal(schemas.Attempt.properties.error_code.type, "string");
  assert.ok(!("quote_supplier_nanoeur" in schemas.Dispatch.properties));
  assert.equal(
    schemas.Dispatch.properties.faxPricing.$ref,
    "#/components/schemas/FaxPricing",
  );
  assert.deepEqual(
    schemas.FaxPricing.properties.settlement.properties.status.enum,
    ["not_reserved", "reserved", "settled", "released"],
  );
  assert.ok(!("faxPricing" in schemas.PrepareDispatch.properties));
  assert.equal(schemas.Attempt.properties.error_code.enum, undefined);
  assert.ok(
    !(
      "Retry-After" in
      spec.paths["/api/dispatches"].get.responses["200"].headers
    ),
  );
});

test("postal contracts keep the source immutable and separate human transfer consent from OAuth", () => {
  const input = spec.components.schemas.PostalPreflightInput;
  assert.equal(input.additionalProperties, false);
  for (const forbidden of [
    "organizationId",
    "sha256",
    "reviewed",
    "consentToTransfer",
    "report",
    "preparedLetterId",
  ])
    assert.ok(!(forbidden in input.properties));
  assert.deepEqual(
    spec.components.schemas.PostalReview.properties.canSend.enum,
    [false],
  );
  assert.equal(spec.paths["/api/postal/preflights/{id}/transfer"], undefined);
  assert.equal(
    spec.paths["/api/postal/preflights/{id}/quote"].post.requestBody,
    undefined,
  );
  assert.equal(
    spec.paths["/api/postal/preflights/{id}/address.png"].get.responses["200"]
      .content["image/png"].schema.format,
    "binary",
  );
});

test("registration documents both explicit beta and historical verification policies", () => {
  const verification =
    spec.components.schemas.Capabilities.properties.registration.properties
      .verification;
  assert.deepEqual(verification.enum, [
    "verified_email",
    "verified_email_and_mfa",
  ]);
  assert.match(
    verification.description,
    /sans politique explicite conserve verified_email_and_mfa/,
  );
  assert.match(
    spec.components.securitySchemes.GuteneoOAuth.description,
    /https:\/\/guteneo\.com\/verified_account=true/,
  );
  assert.match(spec.info.description, /MFA n’est pas obligatoire/);
  assert.doesNotMatch(spec.info.description, /configurer la MFA/);
});
