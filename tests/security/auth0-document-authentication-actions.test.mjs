import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { documentAuthenticationActionSources } from "../../scripts/auth0-document-authentication-actions.mjs";

const START = Date.parse("2026-10-24T12:00:00.100Z");
const COMPLETE = Date.parse("2026-10-24T12:00:02.123Z");
const CLAIM = "https://guteneo.com/document_authentication";
function event() {
  return {
    client: { client_id: "browser_fixture" },
    connection: { id: "con_fixture", strategy: "auth0" },
    user: {
      email_verified: true,
      enrolledFactors: [{ type: "webauthn-platform" }],
    },
    transaction: {
      protocol: "oidc-basic-profile",
      redirect_uri: "https://guteneo.com/auth/callback",
      response_type: ["code"],
      requested_scopes: ["openid", "email"],
      metadata: {},
    },
    authentication: {
      methods: [
        { name: "pwd", timestamp: new Date(START - 500).toISOString() },
      ],
    },
  };
}
function fixture(options = {}) {
  const sources = documentAuthenticationActionSources({
    browserClientId: "browser_fixture",
    connectionId: "con_fixture",
    ...options,
  });
  const calls = { claims: [], challenges: [], denied: [] };
  const value = event();
  const api = {
    access: { deny: (reason) => calls.denied.push(reason) },
    transaction: {
      setMetadata: (key, metadata) => {
        value.transaction.metadata[key] = metadata;
      },
    },
    authentication: {
      challengeWith: (factor) => calls.challenges.push(factor),
    },
    idToken: {
      setCustomClaim: (name, claim) => calls.claims.push([name, claim]),
    },
  };
  async function run(index, now = START) {
    const exports = {};
    runInNewContext(sources[index].code, {
      exports,
      Date: class extends Date {
        static now() {
          return now;
        }
      },
    });
    await exports.onExecutePostLogin(value, api);
  }
  return { sources, calls, event: value, api, run };
}
function complete(value, type = "webauthn-platform", time = COMPLETE) {
  value.authentication.methods.push({
    name: "mfa",
    type,
    timestamp: new Date(time).toISOString(),
  });
}
test("candidate requires exact identities and rejects roaming without Required UV policy", () => {
  for (const options of [
    {},
    { browserClientId: "x');process.exit()", connectionId: "con_fixture" },
  ])
    assert.throws(
      () => documentAuthenticationActionSources(options),
      /EXACT_BROWSER_AND_CONNECTION_REQUIRED/,
    );
  assert.throws(
    () => fixture({ factor: "otp" }),
    /UNSUPPORTED_DOCUMENT_FACTOR/,
  );
  for (const roamingUserVerification of [null, "preferred", "discouraged"])
    assert.throws(
      () => fixture({ factor: "webauthn-roaming", roamingUserVerification }),
      /ROAMING_UV_REQUIRED_POLICY_NOT_VERIFIED/,
    );
});
test("challenge never emits evidence; only the subsequent completed platform MFA supplies its actual date", async () => {
  const f = fixture();
  await f.run(0);
  assert.equal(f.calls.claims.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.challenges)), [
    { type: "webauthn-platform" },
  ]);
  complete(f.event);
  await f.run(1, COMPLETE + 1500);
  assert.equal(f.calls.denied.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.claims)), [
    [
      CLAIM,
      {
        policy: "guteneo-sensitive-v1",
        method: "webauthn_uv",
        factor: "webauthn-platform",
        authenticated_at: Math.floor(COMPLETE / 1000),
      },
    ],
  ]);
  assert.notEqual(
    f.calls.claims[0][1].authenticated_at,
    Math.floor((COMPLETE + 1500) / 1000),
  );
});
test("roaming emits evidence only in a candidate bound to the verified Required policy", async () => {
  const f = fixture({
    factor: "webauthn-roaming",
    roamingUserVerification: "required",
  });
  await f.run(0);
  complete(f.event, "webauthn-roaming");
  await f.run(1, COMPLETE + 100);
  assert.equal(f.calls.claims[0][1].factor, "webauthn-roaming");
});
test("cutover also challenges an ordinary Browser login without ACR and never auto-enrolls it", async () => {
  const f = fixture();
  f.event.user.enrolledFactors = [];
  assert.equal(f.event.transaction.acr_values, undefined);
  await f.run(0);
  assert.equal(f.calls.challenges.length, 1);
  assert.equal(f.calls.claims.length, 0);
  // Auth0 would reject an unenrolled factor; this VM does not pretend enrollment
  // or a successful provider challenge. Rollout therefore needs its own UX gate.
  await f.run(1, COMPLETE + 100);
  assert.equal(f.calls.claims.length, 0);
  assert.equal(f.calls.denied.length, 1);
});
test("all other OAuth clients are untouched, including spoofed test-address metadata", async () => {
  const f = fixture();
  f.event.client.client_id = "other_client";
  f.event.user.email = "test@example.invalid";
  f.event.user.app_metadata = { strong: true };
  await f.run(0);
  complete(f.event);
  await f.run(1, COMPLETE + 100);
  assert.deepEqual(f.calls, { claims: [], challenges: [], denied: [] });
});
test("wrong connection, unverified identity, non-code protocol and wrong callback fail closed", async () => {
  for (const modify of [
    (e) => {
      e.connection.id = "other_connection";
    },
    (e) => {
      e.user.email_verified = false;
    },
    (e) => {
      e.transaction.protocol = "oauth2-refresh-token";
    },
    (e) => {
      e.transaction.redirect_uri = "https://other.example/callback";
    },
    (e) => {
      e.transaction.response_type = ["id_token"];
    },
  ]) {
    const f = fixture();
    modify(f.event);
    await f.run(0);
    complete(f.event);
    await f.run(1, COMPLETE + 100);
    assert.equal(f.calls.claims.length, 0);
    assert.equal(f.calls.challenges.length, 0);
    assert.equal(f.calls.denied.length, 2);
  }
});
test("enrollment, amr=mfa and a passkey name alone never mint documentary assurance", async () => {
  for (const methods of [
    [],
    [{ name: "mfa" }],
    [{ name: "passkey", timestamp: new Date(COMPLETE).toISOString() }],
  ]) {
    const f = fixture();
    await f.run(0);
    f.event.authentication.methods = methods;
    f.event.authentication.amr = ["mfa"];
    await f.run(1, COMPLETE + 100);
    assert.equal(f.calls.claims.length, 0);
    assert.equal(f.calls.denied.length, 1);
  }
});
test("OTP, recovery and a different WebAuthn factor cannot satisfy a selected platform challenge", async () => {
  for (const type of ["otp", "recovery-code", "webauthn-roaming"]) {
    const f = fixture();
    await f.run(0);
    complete(f.event, type);
    await f.run(1, COMPLETE + 100);
    assert.equal(f.calls.claims.length, 0);
    assert.equal(f.calls.denied.length, 1);
  }
});
test("a previous SSO MFA, future date, malformed date and missing timestamp fail closed", async () => {
  for (const timestamp of [
    new Date(START - 1).toISOString(),
    new Date(COMPLETE + 1000).toISOString(),
    "not-a-date",
    undefined,
  ]) {
    const f = fixture();
    await f.run(0);
    f.event.authentication.methods.push({
      name: "mfa",
      type: "webauthn-platform",
      timestamp,
    });
    await f.run(1, COMPLETE + 100);
    assert.equal(f.calls.claims.length, 0);
    assert.equal(f.calls.denied.length, 1);
  }
});
test("proof without the preceding Action or from an expired transaction is rejected", async () => {
  for (const withMarker of [false, true]) {
    const f = fixture();
    if (withMarker) await f.run(0);
    complete(f.event);
    await f.run(1, START + 300_001);
    assert.equal(f.calls.claims.length, 0);
    assert.equal(f.calls.denied.length, 1);
  }
});
test("missing transaction API is closed and no reserved claim or access token is mutated", async () => {
  const f = fixture();
  delete f.api.transaction;
  await f.run(0);
  assert.equal(f.calls.denied.length, 1);
  assert.equal(f.calls.challenges.length, 0);
  for (const { code } of f.sources) {
    assert.doesNotMatch(
      code,
      /console\.|api\.accessToken|setCustomClaim\(["']auth_time|event\.session|recordMethod|multifactor\.enable/,
    );
  }
});
