// Private service binding only. No HTTP listener, public API or send operation.
import { getPlatformProxy } from "wrangler";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import {
  privateOperatorPath,
  readPrivateOperatorJson,
} from "./private-operator-files.mjs";

const [action, inputPath, outputPath] = process.argv.slice(2);
let proxy;
try {
  if (
    !["authorize", "plan", "begin", "advance", "notice", "complete"].includes(
      action,
    ) ||
    !inputPath
  )
    throw new Error("DELETION_USAGE");
  const input = await readPrivateOperatorJson(inputPath, "DELETION");
  if (["notice", "authorize"].includes(action) && !outputPath)
    throw new Error("DELETION_PRIVATE_NOTICE_FILE_REQUIRED");
  const output = outputPath
    ? await privateOperatorPath(outputPath, "DELETION")
    : null;
  let result;
  if (action === "authorize") {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (key) =>
          ![
            "requestId",
            "planHash",
            "expiresAt",
            "operatorSecret",
            "retentions",
          ].includes(key),
      ) ||
      typeof input.requestId !== "string" ||
      !/^[A-Za-z0-9_.:-]{1,160}$/.test(input.requestId) ||
      typeof input.planHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.planHash) ||
      !Number.isSafeInteger(input.expiresAt) ||
      input.expiresAt <= Date.now() ||
      input.expiresAt > Date.now() + 15 * 60000 ||
      typeof input.operatorSecret !== "string" ||
      input.operatorSecret.length < 32 ||
      (input.retentions !== undefined && !Array.isArray(input.retentions))
    )
      throw new Error("DELETION_CAPABILITY_INVALID");
    const { requestId, planHash, expiresAt } = input;
    const signature = createHmac("sha256", input.operatorSecret)
      .update(
        JSON.stringify({
          action: "account_deletion",
          expiresAt,
          planHash,
          requestId,
        }),
      )
      .digest("hex");
    result = {
      requestId,
      planHash,
      capability: { expiresAt, signature },
      ...(input.retentions === undefined
        ? {}
        : { retentions: input.retentions }),
    };
  } else {
    proxy = await getPlatformProxy({
      configPath: fileURLToPath(
        new URL("./process-account-deletion.jsonc", import.meta.url),
      ),
      persist: false,
    });
    result = await proxy.env.ACCOUNT_DELETION[action](input);
  }
  if (output) {
    const file = await open(
      output,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify(result, null, 2) + "\n");
    } finally {
      await file.close();
    }
    console.log(JSON.stringify({ status: "private_result_saved" }));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} catch {
  console.error(
    "Account deletion unavailable. Inspect the private request, reviewed plan, operator capability and processing evidence.",
  );
  process.exitCode = 1;
} finally {
  await proxy?.dispose();
}
