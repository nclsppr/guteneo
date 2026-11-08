import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  writeFile,
  readFile,
  stat,
  rm,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
const execute = promisify(execFile);

test("offline operator authorization uses private files, an exact plan and bounded capability without printing credentials", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "guteneo-deletion-capability-"),
  );
  await chmod(directory, 0o700);
  const input = join(directory, "authority.json"),
    output = join(directory, "command.json");
  const material = {
    requestId: "deletion_synthetic",
    planHash: "a".repeat(64),
    expiresAt: Date.now() + 600000,
    operatorSecret: "synthetic-private-operator-" + "b".repeat(40),
  };
  try {
    await writeFile(input, JSON.stringify(material), { mode: 0o600 });
    const result = await execute(process.execPath, [
      "scripts/process-account-deletion.mjs",
      "authorize",
      input,
      output,
    ]);
    assert.deepEqual(JSON.parse(result.stdout), {
      status: "private_result_saved",
    });
    assert.equal(result.stderr, "");
    const command = JSON.parse(await readFile(output, "utf8"));
    assert.equal(
      command.capability.signature,
      createHmac("sha256", material.operatorSecret)
        .update(
          JSON.stringify({
            action: "account_deletion",
            expiresAt: material.expiresAt,
            planHash: material.planHash,
            requestId: material.requestId,
          }),
        )
        .digest("hex"),
    );
    assert.equal(command.operatorSecret, undefined);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(
      execute(process.execPath, [
        "scripts/process-account-deletion.mjs",
        "authorize",
        input,
        output,
      ]),
    );
    await chmod(input, 0o644);
    await assert.rejects(
      execute(process.execPath, [
        "scripts/process-account-deletion.mjs",
        "authorize",
        input,
        join(directory, "refused.json"),
      ]),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a notice cannot be printed to a terminal and an expired operator capability is refused offline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guteneo-deletion-refusal-"));
  await chmod(directory, 0o700);
  const input = join(directory, "input.json");
  try {
    await writeFile(
      input,
      JSON.stringify({
        requestId: "deletion_synthetic",
        planHash: "a".repeat(64),
        expiresAt: 1,
        operatorSecret: "synthetic-" + "a".repeat(40),
      }),
      { mode: 0o600 },
    );
    for (const args of [
      ["notice", input],
      ["authorize", input, join(directory, "expired.json")],
    ]) {
      try {
        await execute(process.execPath, [
          "scripts/process-account-deletion.mjs",
          ...args,
        ]);
        assert.fail("private command must refuse");
      } catch (error) {
        assert.equal(error.stdout, "");
        assert.match(error.stderr, /Account deletion unavailable/);
        assert.doesNotMatch(error.stderr, /synthetic-/);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
