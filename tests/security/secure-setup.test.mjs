import { test } from "node:test";
import assert from "node:assert/strict";
import { startSecureSetup } from "../../scripts/secure-setup.mjs";
import { chromium, webkit } from "@playwright/test";

test("private setup rejects cross-origin, bad capabilities, duplicate and injected fields; erases successful values", async () => {
  let written;
  let count = 0;
  const setup = await startSecureSetup({
    writer: async (values) => {
      count++;
      written = { ...values };
    },
  });
  try {
    const origin = new URL(setup.url).origin;
    const page = await fetch(setup.url);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.match(
      page.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    const html = await page.text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    const submit = (body, headers = {}) =>
      fetch(setup.url, {
        method: "POST",
        headers: { origin, ...headers },
        body: new URLSearchParams(body),
      });
    assert.equal((await fetch(`${origin}/setup/wrong`)).status, 404);
    assert.equal(
      (
        await submit(
          { csrf, TELNYX_API_KEY: "fixture-secret" },
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await submit({ csrf: "wrong", TELNYX_API_KEY: "fixture-secret" }))
        .status,
      403,
    );
    assert.equal(
      (
        await submit({
          csrf,
          TELNYX_API_KEY: "fixture-secret",
          LIVE_SENDS_ENABLED: "true",
        })
      ).status,
      400,
    );
    assert.equal(
      (await submit({ csrf, TELNYX_API_KEY: "fixture\nsecret" })).status,
      400,
    );
    assert.equal(
      (
        await submit({
          csrf,
          TELNYX_API_KEY: "fixture-secret",
          TELNYX_FROM: "invalid",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await submit([
          ["csrf", csrf],
          ["TELNYX_API_KEY", "one"],
          ["TELNYX_API_KEY", "two"],
        ])
      ).status,
      400,
    );
    assert.equal(count, 0);
    const response = await submit({
      csrf,
      TELNYX_API_KEY: "fixture-secret",
      TELNYX_CONNECTION_ID: "fixture-connection",
    });
    assert.equal(response.status, 200);
    const result = await response.text();
    assert.doesNotMatch(result, /fixture-secret|fixture-connection|<input/);
    assert.deepEqual(written, {
      TELNYX_API_KEY: "fixture-secret",
      TELNYX_CONNECTION_ID: "fixture-connection",
    });
    assert.equal(
      (await submit({ csrf, TELNYX_API_KEY: "fixture-secret" })).status,
      410,
    );
    assert.equal(count, 1);
  } finally {
    await setup.close();
  }
});

test("upload failure never echoes credential or child error; key object is cleared", async () => {
  let held;
  const setup = await startSecureSetup({
    writer: async (values) => {
      held = values;
      throw new Error("sensitive-error-fixture");
    },
  });
  try {
    const csrf = (await (await fetch(setup.url)).text()).match(
      /name="csrf" value="([^"]+)"/,
    )[1];
    const result = await fetch(setup.url, {
      method: "POST",
      headers: { origin: new URL(setup.url).origin },
      body: new URLSearchParams({
        csrf,
        TELNYX_API_KEY: "sensitive-key-fixture",
      }),
    });
    assert.equal(result.status, 503);
    assert.doesNotMatch(
      await result.text(),
      /sensitive-key-fixture|sensitive-error-fixture/,
    );
    assert.equal(held.TELNYX_API_KEY, "");
  } finally {
    await setup.close();
  }
});

test("Stripe mode is derived from the key; unsupported profiles cannot target arbitrary secrets", async () => {
  await assert.rejects(() => startSecureSetup({ profile: "other" }));
  await assert.rejects(() => startSecureSetup({ profile: "__proto__" }));
  let written;
  const setup = await startSecureSetup({
    profile: "stripe",
    writer: async (values) => {
      written = { ...values };
    },
  });
  try {
    const csrf = (await (await fetch(setup.url)).text()).match(
      /name="csrf" value="([^"]+)"/,
    )[1];
    const rejected = await fetch(setup.url, {
      method: "POST",
      headers: { origin: new URL(setup.url).origin },
      body: new URLSearchParams({ csrf, STRIPE_API_KEY: "rk_test_fixture123" }),
    });
    assert.equal(rejected.status, 400);
    const result = await fetch(setup.url, {
      method: "POST",
      headers: { origin: new URL(setup.url).origin },
      body: new URLSearchParams({ csrf, STRIPE_API_KEY: "rk_live_fixture123" }),
    });
    assert.equal(result.status, 200);
    assert.equal(written.STRIPE_MODE, "live");
  } finally {
    await setup.close();
  }
});

const sesFixture = {
  AWS_ACCESS_KEY_ID: "AKIA" + "X".repeat(16),
  AWS_SECRET_ACCESS_KEY: "x".repeat(40),
  AWS_REGION: "eu-west-3",
  SES_CONFIGURATION_SET: "guteneo-fixture",
  SES_SNS_TOPIC_ARN: "arn:aws:sns:eu-west-3:000000000000:guteneo-fixture",
};

test("SES setup validates EU regions, credentials and regional SNS; never enables production", async () => {
  let written;
  let held;
  const setup = await startSecureSetup({
    profile: "ses",
    writer: async (values) => {
      held = values;
      written = { ...values };
    },
  });
  try {
    const html = await (await fetch(setup.url)).text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    assert.match(html, /statut sandbox/);
    assert.doesNotMatch(html, /name="SES_SANDBOX"|name="LIVE_SENDS_ENABLED"/);
    const submit = (changes) => fetch(setup.url, {
      method: "POST",
      headers: { origin: new URL(setup.url).origin },
      body: new URLSearchParams({ csrf, ...sesFixture, ...changes }),
    });
    for (const invalid of [
      { AWS_ACCESS_KEY_ID: "not-an-aws-access-key" },
      { AWS_SECRET_ACCESS_KEY: "not-an-aws-secret" },
      { AWS_REGION: "us-east-1" },
      { AWS_REGION: "eu-west-2" },
      { AWS_REGION: "eu-south-2" },
      { AWS_REGION: "eu-west-99" },
      { SES_CONFIGURATION_SET: "" },
      { SES_CONFIGURATION_SET: "a".repeat(65) },
      { SES_CONFIGURATION_SET: "bad/configuration" },
      { SES_SNS_TOPIC_ARN: "arn:aws:sns:eu-west-1:000000000000:guteneo-fixture" },
      { SES_SNS_TOPIC_ARN: "arn:aws:sns:eu-west-3:123:guteneo-fixture" },
      { SES_SNS_TOPIC_ARN: "arn:aws:sns:eu-west-3:000000000000:guteneo.fifo" },
      { SES_SNS_TOPIC_ARN: "https://evil.example/notifications" },
      { AWS_SESSION_TOKEN: "stale-temporary-token-fixture" },
      { SES_SANDBOX: "false" },
      { LIVE_SENDS_ENABLED: "true" },
    ]) {
      const rejected = await submit(invalid);
      assert.equal(rejected.status, 400);
      assert.doesNotMatch(await rejected.text(), /x{40}|AKIAX{16}/);
      assert.equal(written, undefined);
    }
    const result = await submit({});
    assert.equal(result.status, 200);
    assert.deepEqual(written, {
      ...sesFixture,
      AWS_SESSION_TOKEN: "",
      SES_SANDBOX: "true",
    });
    assert.ok(Object.values(held).every((value) => value === ""));
    assert.doesNotMatch(await result.text(), /x{40}|AKIAX{16}|<input/);
  } finally {
    await setup.close();
  }
});

test("AWS alias requires a bounded session token for temporary SES credentials", async () => {
  let written;
  const setup = await startSecureSetup({
    profile: "aws",
    writer: async (values) => { written = { ...values }; },
  });
  try {
    const csrf = (await (await fetch(setup.url)).text()).match(
      /name="csrf" value="([^"]+)"/,
    )[1];
    const submit = (token) => fetch(setup.url, {
      method: "POST",
      headers: { origin: new URL(setup.url).origin },
      body: new URLSearchParams({
        csrf,
        ...sesFixture,
        AWS_ACCESS_KEY_ID: "ASIA" + "X".repeat(16),
        AWS_SESSION_TOKEN: token,
        SES_SNS_TOPIC_ARN: "",
      }),
    });
    for (const token of ["", "token with space", "t".repeat(4097)]) {
      assert.equal((await submit(token)).status, 400);
      assert.equal(written, undefined);
    }
    const result = await submit("temporary-session-token-fixture");
    assert.equal(result.status, 200);
    assert.equal(written.AWS_SESSION_TOKEN, "temporary-session-token-fixture");
    assert.equal(written.SES_SANDBOX, "true");
    assert.equal(written.SES_SNS_TOPIC_ARN, undefined);
    assert.doesNotMatch(await result.text(), /temporary-session-token-fixture/);
  } finally {
    await setup.close();
  }
});

for (const browserType of [chromium, webkit]) {
  test(`real ${browserType.name()} form submission preserves Origin and never returns the secret`, async () => {
    let written;
    const setup = await startSecureSetup({
      writer: async (values) => {
        written = { ...values };
      },
    });
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage();
      await page.goto(setup.url);
      await page
        .getByLabel("Clé API Telnyx", { exact: true })
        .fill("fixture-browser-key");
      await page
        .getByRole("button", { name: "Enregistrer dans Cloudflare" })
        .click();
      await page
        .getByText("Configuration enregistrée dans Cloudflare.", {
          exact: true,
        })
        .waitFor();
      assert.equal(written.TELNYX_API_KEY, "fixture-browser-key");
      assert.doesNotMatch(await page.content(), /fixture-browser-key|<input/);
    } finally {
      await browser.close();
      await setup.close();
    }
  });
  test(`real ${browserType.name()} SES form submits dedicated AWS credentials with sandbox fixed`, async () => {
    let written;
    const setup = await startSecureSetup({
      profile: "ses",
      writer: async (values) => { written = { ...values }; },
    });
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage();
      await page.goto(setup.url);
      for (const [field, value] of Object.entries(sesFixture)) {
        const input = page.locator(`input[name="${field}"]`);
        assert.equal(await input.getAttribute("type"), "password");
        await input.fill(value);
      }
      await page.getByRole("button", { name: "Enregistrer dans Cloudflare" }).click();
      await page.getByText("Configuration enregistrée dans Cloudflare.", { exact: true }).waitFor();
      assert.equal(written.AWS_SECRET_ACCESS_KEY, sesFixture.AWS_SECRET_ACCESS_KEY);
      assert.equal(written.SES_SANDBOX, "true");
      assert.equal(written.AWS_SESSION_TOKEN, "");
      assert.doesNotMatch(await page.content(), /x{40}|AKIAX{16}|<input/);
    } finally {
      await browser.close();
      await setup.close();
    }
  });
}
