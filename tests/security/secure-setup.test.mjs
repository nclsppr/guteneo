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
}
