import { strict as assert } from "node:assert";
import { once } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { test } from "node:test";
import { forwardPrivateTestOutput } from "../../scripts/distribution-e2e-output.mjs";

async function output(chunks) {
  let text = "";
  const source = new PassThrough();
  forwardPrivateTestOutput(source, new Writable({ write(chunk, _encoding, done) { text += chunk; done(); } }));
  for (const chunk of chunks) source.write(chunk);
  source.end();
  await once(source, "end");
  return text;
}
test("the console never emits an invitation split across arbitrary runner chunks", async () => {
  const token = "a1".repeat(32);
  const text = await output(["17:30 navigated to /#/app/my-documents?invitation=", token.slice(0, 13), token.slice(13, 57), token.slice(57), "\n"]);
  assert.equal(text, "17:30 navigated to /#/app/my-documents?invitation=[REDACTED_64_HEX]\n");
  assert.ok(!text.includes(token));
});
test("the final unterminated error line is sanitized before it leaves the wrapper", async () => {
  assert.equal(await output(["error ", "b2".repeat(32)]), "error [REDACTED_64_HEX]");
});
test("encoded fragments and ANSI-colored values cannot bypass console protection", async () => {
  const token = "C3".repeat(32);
  const text = await output([`returnTo=%23%2Fapp%3Finvitation%3D\u001b[31m${token}\u001b[0m\n`]);
  assert.ok(!text.includes(token));
  assert.ok(text.includes("[REDACTED_64_HEX]"));
});
test("a very long unterminated line is dropped rather than partially exposing a secret", async () => {
  const token = "d4".repeat(32);
  assert.equal(await output(["x".repeat(65537), token, "\nnext line\n"]), "[Oversized test output omitted]\nnext line\n");
});
test("one oversized complete line is also dropped while ordinary evidence remains", async () => {
  assert.equal(await output(["x".repeat(65537) + "\nstatus failed at 17:30\n"]), "[Oversized test output omitted]\nstatus failed at 17:30\n");
});
