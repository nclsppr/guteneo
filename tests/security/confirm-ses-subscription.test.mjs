import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { chromium, webkit } from "@playwright/test";
import {
  SES_TOPIC_ARN,
  readConfirmationReceipt,
  startSnsConfirmation,
  validateConfirmationReceipt,
} from "../../scripts/confirm-ses-subscription.mjs";

const now = Date.parse("2026-09-17T10:00:00.000Z");
const token = "private-sns-fixture-token-0123456789";
const metadata = {
  type: "SubscriptionConfirmation",
  topicArn: SES_TOPIC_ARN,
  occurredAt: "2026-09-17T09:55:00.000Z",
  confirmationToken: token,
};
const row = {
  provider: "ses",
  event_id: "00000000-1111-4222-8333-444444444444",
  status: "unrecognized",
  received_at: "2026-09-17T09:55:01.000Z",
  payload_json: JSON.stringify({ metadata }),
};
const changedMetadata = (change) => ({
  ...row,
  payload_json: JSON.stringify({ metadata: { ...metadata, ...change } }),
});

test("SNS receipt selection requires exact signed-handler provenance fields and freshness", () => {
  const result = validateConfirmationReceipt(row, now);
  assert.equal(result.token, token);
  assert.equal(result.eventId, row.event_id);
  assert.equal(result.ageSeconds, 300);
  for (const invalid of [
    null,
    { ...row, provider: "telnyx" },
    { ...row, status: "projected" },
    { ...row, event_id: "<script>unsafe</script>" },
    { ...row, payload_json: `invalid-json-${token}` },
    { ...row, payload_json: JSON.stringify({ metadata, event: {} }) },
    { ...row, received_at: "2026-09-15T09:55:00.000Z" },
    { ...row, received_at: "2026-09-17T10:06:00.000Z" },
    changedMetadata({ type: "UnsubscribeConfirmation" }),
    changedMetadata({ type: "Notification" }),
    changedMetadata({
      topicArn: SES_TOPIC_ARN.replace("982055099242", "000000000000"),
    }),
    changedMetadata({ SubscribeURL: "https://evil.example/" }),
    changedMetadata({ confirmationToken: "" }),
    changedMetadata({ confirmationToken: "t".repeat(4097) }),
    changedMetadata({ confirmationToken: 'token-with-"-unsafe-markup' }),
    changedMetadata({ occurredAt: "2026-09-15T10:00:00.000Z" }),
    changedMetadata({ occurredAt: "2026-09-17T10:06:00.000Z" }),
    changedMetadata({
      occurredAt: "2026-09-17T09:00:00.000Z",
      confirmationToken: null,
    }),
  ]) {
    assert.throws(
      () => validateConfirmationReceipt(invalid, now),
      (error) => {
        assert.equal(error.message, "No valid recent SNS confirmation receipt");
        assert.ok(!error.message.includes(token));
        return true;
      },
    );
  }
});

test("SNS retrieval is one fixed read-only bounded D1 query with sanitized failures", async () => {
  let args;
  const result = await readConfirmationReceipt({
    now,
    run: async (value) => {
      args = value;
      return JSON.stringify([{ success: true, results: [row] }]);
    },
  });
  assert.equal(result.token, token);
  assert.deepEqual(args.slice(0, 7), [
    "d1",
    "execute",
    "guteneo-production",
    "--remote",
    "--config",
    "wrangler.live.jsonc",
    "--command",
  ]);
  assert.equal(args.at(-1), "--json");
  const sql = args.at(-2);
  assert.match(sql, /^SELECT /);
  assert.match(sql, /LIMIT 1$/);
  assert.ok(sql.includes(SES_TOPIC_ARN));
  assert.doesNotMatch(sql, /UPDATE|DELETE|INSERT|SubscribeURL/);
  assert.ok(!sql.includes(token));
  for (const raw of [
    `error containing ${token}`,
    "x".repeat(65_537),
    JSON.stringify([{ success: false, results: [row] }]),
    JSON.stringify([{ success: true, results: [] }]),
    JSON.stringify([{ success: true, results: [row, row] }]),
  ]) {
    await assert.rejects(
      () => readConfirmationReceipt({ now, run: async () => raw }),
      {
        message:
          "SNS receipt retrieval unavailable or no valid recent confirmation",
      },
    );
  }
  await assert.rejects(
    () =>
      readConfirmationReceipt({
        now,
        run: async () => {
          throw new Error(token);
        },
      }),
    {
      message:
        "SNS receipt retrieval unavailable or no valid recent confirmation",
    },
  );
});

test("SNS private display checks Host, Origin and capability; serves the password once", async () => {
  const receipt = validateConfirmationReceipt(row, now);
  const setup = await startSnsConfirmation({
    reader: async () => receipt,
    now: () => now,
  });
  try {
    assert.ok(!JSON.stringify(setup).includes(token));
    const url = new URL(setup.url);
    assert.equal(url.hostname, "127.0.0.1");
    assert.match(url.pathname, /^\/sns\/[a-f0-9]{64}$/);
    assert.equal((await fetch(new URL("/sns/wrong", url))).status, 404);
    const wrongHost = await new Promise((resolve, reject) => {
      const req = request(
        setup.url,
        { headers: { Host: "evil.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(wrongHost, 404);
    assert.equal(
      (await fetch(setup.url, { headers: { Origin: "https://evil.example" } }))
        .status,
      403,
    );
    assert.equal(
      (await fetch(setup.url, { headers: { "Sec-Fetch-Site": "cross-site" } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(setup.url, {
          method: "POST",
          headers: { Origin: url.origin },
        })
      ).status,
      405,
    );
    const response = await fetch(setup.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(
      response.headers.get("content-security-policy"),
      /default-src 'none'.*form-action 'none'.*frame-ancestors 'none'/,
    );
    const html = await response.text();
    assert.match(
      html,
      /id="token" type="password" readonly autocomplete="off"/,
    );
    assert.ok(html.includes(`value="${token}"`));
    assert.doesNotMatch(html, /SubscribeURL|https?:\/\//);
    assert.match(
      response.headers.get("content-security-policy"),
      /script-src 'nonce-[A-Za-z0-9+/=]+'/,
    );
    assert.match(html, /<script nonce="[A-Za-z0-9+/=]+">/);
    assert.equal(
      response.headers.get("permissions-policy"),
      "clipboard-read=(), clipboard-write=(self)",
    );
    assert.equal(receipt.token, "");
    const repeated = await fetch(setup.url);
    assert.equal(repeated.status, 410);
    assert.ok(!(await repeated.text()).includes(token));
  } finally {
    await setup.close();
  }
});

test("SNS helper lifetime cannot outlive the confirmation token or ten minutes", async () => {
  await assert.rejects(() => startSnsConfirmation({ timeoutMs: 600_001 }), {
    message: "Invalid local confirmation lifetime",
  });
  await assert.rejects(() =>
    startSnsConfirmation({
      reader: async () => validateConfirmationReceipt(row, now),
      now: () => now + 48 * 60 * 60_000,
    }),
  );
  const receipt = validateConfirmationReceipt(row, now);
  let clock = now;
  const setup = await startSnsConfirmation({
    reader: async () => receipt,
    now: () => clock,
  });
  try {
    clock += 10 * 60_000;
    const response = await fetch(setup.url);
    assert.equal(response.status, 410);
    assert.ok(!(await response.text()).includes(token));
  } finally {
    await setup.close();
  }
  assert.equal(receipt.token, "");
});

for (const browserType of [chromium, webkit]) {
  test(`real ${browserType.name()} SNS copy button keeps the token masked and clears it after transfer`, async () => {
    const setup = await startSnsConfirmation({
      reader: async () => validateConfirmationReceipt(row, now),
      now: () => now,
    });
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        // In-memory fixture clipboard: never reads or writes the user's clipboard.
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (value) => {
              window.fixtureCopiedToken = value;
            },
          },
        });
      });
      await page.goto(setup.url);
      const input = page.getByLabel("Jeton SNS privé", { exact: true });
      assert.equal(await input.getAttribute("type"), "password");
      await input.focus();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+A" : "Control+A",
      );
      const selection = await input.evaluate((element) => ({
        start: element.selectionStart,
        end: element.selectionEnd,
      }));
      assert.deepEqual(selection, { start: 0, end: token.length });
      assert.ok(!(await page.locator("body").innerText()).includes(token));
      assert.equal(await page.locator("form").count(), 0);
      await page
        .getByRole("button", { name: "Copier le jeton", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Jeton copié." })
        .waitFor();
      assert.equal(await page.evaluate(() => window.fixtureCopiedToken), token);
      assert.equal(await input.inputValue(), "");
      assert.equal(
        await page
          .getByRole("button", { name: "Copier le jeton", exact: true })
          .isDisabled(),
        true,
      );
      assert.ok(!(await page.locator("body").innerText()).includes(token));
      assert.ok(!(await page.content()).includes(token));
    } finally {
      await browser.close();
      await setup.close();
    }
  });
}
