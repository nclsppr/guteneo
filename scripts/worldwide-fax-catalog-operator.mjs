import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getPlatformProxy } from "wrangler";

const root = fileURLToPath(new URL("../", import.meta.url));
const versionId = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

export function parseArguments(args) {
  if (!args.length || (args.length === 1 && args[0] === "--status"))
    return { initialize: false };
  if (
    args.length === 2 &&
    args[0] === "--initialize-production" &&
    versionId.test(args[1])
  )
    return { initialize: true, expectedVersion: args[1] };
  throw new Error("USAGE");
}

async function checkPublishedSource() {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const head = git("rev-parse", "HEAD");
  if (git("status", "--porcelain") || !/^[a-f0-9]{40}$/.test(head))
    throw new Error("CLEAN_RELEASE_CHECKOUT_REQUIRED");
  const response = await fetch("https://guteneo.com/release.json", {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("PUBLISHED_SOURCE_REQUIRED");
  const release = await response.json();
  if (
    release.product !== "Guteneo" ||
    release.mode !== "production" ||
    release.sourceDirty !== false ||
    release.sourceCommit !== head
  )
    throw new Error("PUBLISHED_SOURCE_REQUIRED");
}

export async function runCatalogOperator(
  operator,
  options,
  verifySource = checkPublishedSource,
) {
  const current = await operator.status();
  if (!options.initialize) return current;
  if (
    !options.expectedVersion ||
    current.workerVersionId !== options.expectedVersion
  )
    throw new Error("WORKER_VERSION_CHANGED");
  await verifySource();
  const result = await operator.initialize();
  if (result.catalog.workerVersionId !== options.expectedVersion)
    throw new Error("WORKER_VERSION_CHANGED_VERIFY_STATUS");
  return result;
}

async function main() {
  let proxy;
  try {
    const options = parseArguments(process.argv.slice(2));
    proxy = await getPlatformProxy({
      configPath: fileURLToPath(
        new URL("./worldwide-fax-catalog-operator.jsonc", import.meta.url),
      ),
      persist: false,
      envFiles: [],
    });
    const result = await runCatalogOperator(proxy.env.CATALOG, options);
    console.log(JSON.stringify(result));
    if (options.initialize && !result.catalog.active) process.exitCode = 1;
  } catch (error) {
    const safe = [
      "USAGE",
      "CLEAN_RELEASE_CHECKOUT_REQUIRED",
      "PUBLISHED_SOURCE_REQUIRED",
      "WORKER_VERSION_CHANGED",
      "WORKER_VERSION_CHANGED_VERIFY_STATUS",
    ];
    console.error(
      safe.includes(error?.message)
        ? error.message
        : "PRIVATE_CATALOG_OPERATION_UNCONFIRMED",
    );
    process.exitCode = 1;
  } finally {
    await proxy?.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
