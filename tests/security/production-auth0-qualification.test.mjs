import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  auth0QualificationPlan,
  inspectAuth0Qualification,
} from "../../scripts/qualify-production-auth0.mjs";
import { TENANT } from "../../scripts/setup-auth0.mjs";

const calls = (run) => run.mock.calls.map((call) => call.arguments);
function responses() {
  return mock.fn(async (args) => {
    if (args[0] === "tenants")
      return [{ name: TENANT, active: true, token: "PRIVATE_TOKEN" }];
    assert.deepEqual(args.slice(0, 2), ["api", "get"]);
    switch (args[2]) {
      case "connections":
        return [
          { id: "con_fixture", name: "Guteneo-Accounts", strategy: "auth0" },
        ];
      case "connections/con_fixture":
        return {
          options: {
            authentication_methods: {
              passkey: { enabled: false },
              password: { enabled: true },
            },
            passkey_options: {
              challenge_ui: "both",
              user_verification: "PRIVATE_CONNECTION_SECRET",
            },
            configuration: { secret: "PRIVATE_CONNECTION_SECRET" },
          },
          enabled_clients: ["browser_fixture"],
        };
      case "clients":
        return [
          {
            client_id: "browser_fixture",
            client_secret: "PRIVATE_CLIENT_SECRET",
            name: "Guteneo - Browser",
            callbacks: ["https://guteneo.com/auth/callback"],
            grant_types: ["authorization_code"],
            client_metadata: { guteneo_managed_by: "guteneo-setup-v1" },
          },
        ];
      case "actions/triggers/post-login/bindings":
        return {
          bindings: [
            {
              action: {
                id: "action_fixture",
                name: "Guteneo - verified identity claims",
              },
            },
          ],
        };
      case "actions/actions/action_fixture":
        return {
          name: "Guteneo - verified identity claims",
          secrets: [
            { name: "PRIVATE_SECRET_NAME", value: "PRIVATE_SECRET_VALUE" },
          ],
          deployed_version: {
            deployed: true,
            code: "const token='PRIVATE_ACTION_LITERAL'; // document_authentication guteneo-sensitive-v1 webauthn_uv auth_time event.authentication.methods",
          },
        };
      case "guardian/factors":
        return [
          { name: "otp", enabled: true },
          { name: "webauthn-platform", enabled: false },
          { name: "webauthn-roaming", enabled: true },
          { name: "unexpected-private-factor-name", enabled: true },
        ];
      case "guardian/factors/webauthn-roaming/settings":
        return {
          userVerification: "required",
          privateKey: "PRIVATE_FACTOR_SECRET",
        };
      default:
        throw new Error("UNEXPECTED_ENDPOINT");
    }
  });
}

describe("read-only production Auth0 qualification", () => {
  it("offers an offline plan without a CLI, credential or user data", () => {
    const plan = auth0QualificationPlan();
    assert.partialDeepStrictEqual(plan, {
      mode: "plan",
      ready: false,
      noProvisioning: true,
      noUserReads: true,
      noSecretOutput: true,
    });
    assert.deepEqual(plan.requiredReadScopes, [
      "read:connections",
      "read:clients",
      "read:actions",
      "read:guardian_factors",
    ]);
    assert.equal(
      plan.operations.every((operation) => operation.startsWith("GET ")),
      true,
    );
    const child = spawnSync(
      process.execPath,
      ["scripts/qualify-production-auth0.mjs", "--plan"],
      {
        cwd: new URL("../../", import.meta.url),
        env: { PATH: "" },
        encoding: "utf8",
      },
    );
    assert.equal(child.status, 0);
    assert.deepEqual(JSON.parse(child.stdout), plan);
    assert.equal(child.stderr, "");
  });

  it("projects safe metadata and never qualifies assurance from source substrings", async () => {
    const run = responses(),
      report = await inspectAuth0Qualification(run);
    assert.partialDeepStrictEqual(report, {
      noMutations: true,
      noUserReads: true,
      ready: false,
      liveMethodQualified: false,
      sourceEvidenceIsStaticOnly: true,
      managementReads: {
        connections: true,
        clients: true,
        actions: true,
        guardian: true,
      },
      connection: {
        passkeyEnabled: false,
        passwordEnabled: true,
        connectionUvRequiredSetterDocumented: false,
      },
      browserApplication: {
        callbackExpected: true,
        authorizationCode: true,
        enabledOnConnection: true,
        nativePasskeyGrant: false,
        nativePasskeyGrantRequiredForHostedRedirect: false,
      },
      roamingUserVerification: "required",
    });
    assert.partialDeepStrictEqual(report.actions[0], {
      deployed: true,
      deployedSourceRead: true,
      mentionsDocumentClaim: true,
      mentionsDocumentPolicy: true,
      methodQualified: false,
    });
    assert.match(report.actions[0].sourceSha256, /^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(
      serialized,
      /PRIVATE_|unexpected-private-factor-name|browser_fixture/,
    );
    assert.deepEqual(report.guardianFactors, [
      { name: "otp", enabled: true, trialExpired: null },
      { name: "webauthn-platform", enabled: false, trialExpired: null },
      { name: "webauthn-roaming", enabled: true, trialExpired: null },
    ]);
    assert.equal(
      calls(run).every(
        ([args]) =>
          args[0] === "tenants" || (args[0] === "api" && args[1] === "get"),
      ),
      true,
    );
    assert.equal(
      calls(run).some(([args]) =>
        args.some(
          (value) =>
            /users|secrets|login|patch|post|put|delete|create/.test(value) &&
            value !== "actions/triggers/post-login/bindings",
        ),
      ),
      false,
    );
  });

  it("refuses a different tenant before any Management API request", async () => {
    const run = mock.fn(async () => [
      { name: "unrelated.example.auth0.com", active: true },
    ]);
    await assert.rejects(inspectAuth0Qualification(run), /WRONG_TENANT/);
    assert.equal(run.mock.callCount(), 1);
  });

  it("rechecks the tenant between reads and stops on a changed profile", async () => {
    const normal = responses();
    let checks = 0;
    const run = mock.fn(async (args) => {
      if (args[0] === "tenants" && ++checks === 2)
        return [{ name: "unrelated.example.auth0.com", active: true }];
      return normal(args);
    });
    await assert.rejects(inspectAuth0Qualification(run), /WRONG_TENANT/);
    assert.equal(calls(run).filter(([args]) => args[0] === "api").length, 1);
  });

  it("distinguishes unavailable privileges from disabled factors without exposing provider errors", async () => {
    const normal = responses();
    const report = await inspectAuth0Qualification(async (args) => {
      if (args[2] === "guardian/factors")
        throw new Error("PRIVATE_PROVIDER_ERROR");
      return normal(args);
    });
    assert.equal(report.managementReads.guardian, false);
    assert.equal(report.guardianFactors, null);
    assert.equal(report.roamingUserVerification, null);
    assert.deepEqual(report.failures, [
      {
        resource: "guardian",
        code: "MANAGEMENT_READ_UNAVAILABLE",
        requiredScope: "read:guardian_factors",
      },
    ]);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_PROVIDER_ERROR/);
  });

  it("does not inspect settings of an explicitly disabled factor", async () => {
    const normal = responses();
    const run = mock.fn(async (args) => {
      if (args[2] === "guardian/factors")
        return [{ name: "webauthn-roaming", enabled: false }];
      return normal(args);
    });
    const report = await inspectAuth0Qualification(run);
    assert.equal(report.managementReads.guardian, true);
    assert.equal(report.roamingUserVerification, null);
    assert.deepEqual(report.guardianFactors, [
      {
        name: "webauthn-roaming",
        enabled: false,
        trialExpired: null,
      },
    ]);
    assert.equal(
      calls(run).some(([args]) => args[2]?.endsWith("/settings")),
      false,
    );
  });
});
