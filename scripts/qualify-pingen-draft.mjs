// Operator-only local helper. Never deploy this file/configuration.
// Credentials, provider IDs and upload URLs stay inside the remote Worker.
import { pathToFileURL, fileURLToPath } from "node:url";

const phases = Object.freeze({
  "--price-only": "calculator",
  "--create-synthetic-draft": "create",
  "--inspect-created": "inspect",
  "--delete-created": "cleanup",
});

class DriverFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
async function bounded(promise, timeoutMs, code) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new DriverFailure(code)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export const DRIVER_MESSAGES = Object.freeze({
  connection_timeout:
    "Connexion privee expiree avant l'obtention du proxy : aucune RPC declenchee.",
  connection_failed: "Connexion privee indisponible : aucune RPC declenchee.",
  create_timeout:
    "Resultat de creation potentiellement inconnu. Ne pas relancer la creation ; utiliser uniquement --inspect-created pour consulter le run.",
  create_failed:
    "Resultat de creation potentiellement inconnu. Ne pas relancer la creation ; utiliser uniquement --inspect-created pour consulter le run.",
  operation_timeout:
    "Lecture ou nettoyage interrompu : resultat non confirme. Consulter le run avec --inspect-created.",
  operation_failed:
    "Lecture ou nettoyage non confirme. Consulter le run avec --inspect-created.",
});
const RUN_ID = "20260917-synthetic-v1";
const SOURCE_SHA256 =
  "ee8217b869d6e552df3582ea2f886e4c7889964000ef26c975424ece5ba53385";
// Defense in depth: a wrong/stale deployed RPC must not become a logging proxy.
export function filtered(value) {
  const states = [
    "not_started",
    "claimed",
    "created",
    "create_failed",
    "create_unknown",
    "delete_claimed",
    "delete_unknown",
    "deleted",
  ];
  const codes = [
    "input_invalid",
    "configuration_invalid",
    "expired",
    "journal_invalid",
    "journal_conflict",
    "journal_unavailable",
    "already_claimed",
    "no_created_draft",
    "request_failed",
    "request_timeout",
    "response_invalid",
    "http_error",
    "scope_mismatch",
    "profile_mismatch",
    "upload_origin_mismatch",
    "draft_mismatch",
    "draft_submitted",
    "delete_not_allowed",
    "cleanup_pending",
    "price_pending",
  ];
  if (
    !value ||
    value.provider !== "pingen" ||
    value.runId !== RUN_ID ||
    value.sourceSha256 !== SOURCE_SHA256 ||
    value.mode !== "synthetic_draft_qualification" ||
    !states.includes(value.state)
  )
    throw new DriverFailure("operation_failed");
  const result = {
    provider: "pingen",
    mode: "synthetic_draft_qualification",
    status: value.status === "ok" ? "ok" : "error",
    state: value.state,
    runId: RUN_ID,
    sourceSha256: SOURCE_SHA256,
    canSend: false,
    liveSendingVerified: false,
    appJourneyVerified: false,
  };
  if (
    value.price?.currency === "EUR" &&
    Number.isSafeInteger(value.price.minor) &&
    value.price.minor >= 0 &&
    value.price.minor <= 100000
  )
    result.price = { currency: "EUR", minor: value.price.minor };
  if (value.draft) {
    result.draft = {};
    for (const key of [
      "addressMatches",
      "countryMatches",
      "normalPaper",
      "fontsEmbedded",
      "deleteAllowed",
      "readyForSending",
      "previewRedirectObserved",
    ])
      result.draft[key] = value.draft[key] === true;
    result.draft.pages =
      Number.isInteger(value.draft.pages) &&
      value.draft.pages > 0 &&
      value.draft.pages <= 320
        ? value.draft.pages
        : null;
  }
  if (codes.includes(value.error?.code))
    result.error = {
      code: value.error.code,
      ...(Number.isInteger(value.error.httpStatus) &&
      value.error.httpStatus >= 100 &&
      value.error.httpStatus <= 599
        ? { httpStatus: value.error.httpStatus }
        : {}),
    };
  return result;
}

export async function run(
  args,
  {
    connect,
    output = console.log,
    connectionTimeoutMs = 20000,
    operationTimeoutMs = 50000,
  } = {},
) {
  if (args.length !== 1 || !Object.hasOwn(phases, args[0])) {
    throw new Error(
      "Use exactly one of --price-only, --create-synthetic-draft, --inspect-created, --delete-created.",
    );
  }
  const createProxy = connect ?? (await import("wrangler")).getPlatformProxy;
  const connection = Promise.resolve().then(() =>
    createProxy({
      configPath: fileURLToPath(
        new URL("./qualify-pingen-draft.jsonc", import.meta.url),
      ),
      persist: false,
      envFiles: [],
    }),
  );
  let proxy;
  try {
    proxy = await bounded(
      connection,
      connectionTimeoutMs,
      "connection_timeout",
    );
  } catch (error) {
    // A late connection is disposed without ever calling a provider RPC.
    void connection.then((late) => late.dispose()).catch(() => undefined);
    throw error instanceof DriverFailure
      ? error
      : new DriverFailure("connection_failed");
  }
  try {
    const creating = phases[args[0]] === "create";
    let raw;
    try {
      raw = await bounded(
        Promise.resolve().then(() =>
          proxy.env.PROVIDERS.qualifyPingenSynthetic({
            phase: phases[args[0]],
          }),
        ),
        operationTimeoutMs,
        creating ? "create_timeout" : "operation_timeout",
      );
    } catch (error) {
      throw error instanceof DriverFailure
        ? error
        : new DriverFailure(creating ? "create_failed" : "operation_failed");
    }
    const result = filtered(raw);
    output(JSON.stringify(result, null, 2));
    return result.status === "ok" ? 0 : 1;
  } finally {
    await bounded(
      Promise.resolve().then(() => proxy.dispose()),
      3000,
      "operation_timeout",
    ).catch(() => undefined);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exit(await run(process.argv.slice(2)));
  } catch (error) {
    console.error(
      DRIVER_MESSAGES[error?.code] ??
        "Commande de qualification invalide ou indisponible. Aucun resultat n'est infere.",
    );
    process.exit(1);
  }
}
