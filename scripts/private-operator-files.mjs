import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { execFileSync } from "node:child_process";

const fail = (prefix, suffix) => {
  throw new Error(`${prefix}_${suffix}`);
};
/** Resolve private operator material outside every Git checkout, never via a file symlink. */
export async function privateOperatorPath(path, prefix) {
  if (typeof path !== "string" || !isAbsolute(path))
    fail(prefix, "PRIVATE_DIRECTORY_REQUIRED");
  const parent = await realpath(dirname(path));
  if ((await lstat(parent)).mode & 0o077)
    fail(prefix, "PRIVATE_DIRECTORY_REQUIRED");
  let git = false;
  try {
    git =
      execFileSync(
        "git",
        ["-C", parent, "rev-parse", "--is-inside-work-tree"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim() === "true";
  } catch (error) {
    // Git's normal outside-checkout result is 128. Missing/broken inspection
    // must not quietly authorise reading a file whose location is unknown.
    if (error.status !== 128) fail(prefix, "PRIVATE_DIRECTORY_REQUIRED");
  }
  if (git) fail(prefix, "PRIVATE_DIRECTORY_REQUIRED");
  return join(parent, basename(path));
}
export async function readPrivateOperatorJson(
  path,
  prefix,
  maximum = 2_000_000,
) {
  const resolved = await privateOperatorPath(path, prefix);
  let file;
  try {
    file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    fail(prefix, "PRIVATE_FILE_REQUIRED");
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > maximum)
      fail(prefix, "PRIVATE_FILE_REQUIRED");
    return JSON.parse(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
}
