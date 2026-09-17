// Local operator helper only. Never deploy this file or its configuration.
import { fileURLToPath, pathToFileURL } from "node:url";

const categories = Object.freeze([
  "issues",
  "sent",
  "undeliverable",
  "delivered",
]);
const configurations = [
  "unknown",
  "missing",
  "matched",
  "unverified",
  "conflict",
];
const journals = ["none", "claimed", "registered", "unknown", "rejected"];
const errorCodes = [
  "input_invalid",
  "configuration_invalid",
  "secret_required",
  "secret_invalid",
  "request_failed",
  "request_timeout",
  "response_invalid",
  "http_error",
  "scope_mismatch",
  "list_incomplete",
  "webhook_conflict",
  "journal_invalid",
  "journal_conflict",
  "journal_unavailable",
  "registration_pending",
  "registration_rejected",
];

class DriverFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export const DRIVER_MESSAGES = Object.freeze({
  connection_timeout: "Connexion privee expiree : aucune RPC declenchee.",
  connection_failed: "Connexion privee indisponible : aucune RPC declenchee.",
  registration_timeout:
    "Inscription potentiellement inconnue. Ne pas relancer --register ; utiliser --inspect pour rapprocher le resultat.",
  registration_failed:
    "Inscription potentiellement inconnue. Ne pas relancer --register ; utiliser --inspect pour rapprocher le resultat.",
  inspection_timeout: "Inspection expiree : aucun resultat confirme.",
  inspection_failed: "Inspection indisponible : aucun resultat confirme.",
});
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
function inputFor(args) {
  if (args.length === 1 && args[0] === "--inspect")
    return { action: "inspect" };
  if (
    args.length === 2 &&
    args[0] === "--register" &&
    categories.includes(args[1])
  )
    return { action: "register", category: args[1] };
  throw new Error(
    "Use --inspect or --register issues|sent|undeliverable|delivered.",
  );
}

// Project only a fixed vocabulary, even if the remote Worker is stale or faulty.
export function filtered(value, expectedAction) {
  if (
    !value ||
    value.provider !== "pingen" ||
    value.environment !== "production" ||
    value.mode !== "webhook_setup" ||
    value.action !== expectedAction ||
    !["ok", "error"].includes(value.status) ||
    !value.categories
  )
    throw new DriverFailure(
      expectedAction === "register"
        ? "registration_failed"
        : "inspection_failed",
    );
  const projection = {};
  for (const category of categories) {
    const entry = value.categories[category];
    if (
      !entry ||
      !configurations.includes(entry.configuration) ||
      !journals.includes(entry.journal)
    )
      throw new DriverFailure(
        expectedAction === "register"
          ? "registration_failed"
          : "inspection_failed",
      );
    projection[category] = {
      configuration: entry.configuration,
      journal: entry.journal,
    };
  }
  const result = {
    provider: "pingen",
    environment: "production",
    mode: "webhook_setup",
    action: expectedAction,
    status: value.status,
    secretPresent: value.secretPresent === true,
    secretValid: value.secretValid === true,
    listComplete: value.listComplete === true,
    categories: projection,
    notificationsVerified: false,
    canSend: false,
  };
  if (errorCodes.includes(value.error?.code)) {
    result.error = {
      code: value.error.code,
      ...(Number.isInteger(value.error.httpStatus) &&
      value.error.httpStatus >= 100 &&
      value.error.httpStatus <= 599
        ? { httpStatus: value.error.httpStatus }
        : {}),
    };
  }
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
  const input = inputFor(args);
  const createProxy = connect ?? (await import("wrangler")).getPlatformProxy;
  const connection = Promise.resolve().then(() =>
    createProxy({
      configPath: fileURLToPath(
        new URL("./setup-pingen-webhooks.jsonc", import.meta.url),
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
    void connection.then((late) => late.dispose()).catch(() => undefined);
    throw error instanceof DriverFailure
      ? error
      : new DriverFailure("connection_failed");
  }
  try {
    const registering = input.action === "register";
    let raw;
    try {
      raw = await bounded(
        Promise.resolve().then(() =>
          proxy.env.PROVIDERS.configurePingenWebhooks(input),
        ),
        operationTimeoutMs,
        registering ? "registration_timeout" : "inspection_timeout",
      );
    } catch (error) {
      throw error instanceof DriverFailure
        ? error
        : new DriverFailure(
            registering ? "registration_failed" : "inspection_failed",
          );
    }
    const result = filtered(raw, input.action);
    output(JSON.stringify(result, null, 2));
    return result.status === "ok" ? 0 : 1;
  } finally {
    await bounded(
      Promise.resolve().then(() => proxy.dispose()),
      3000,
      "inspection_timeout",
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
        "Commande de configuration invalide. Aucun resultat n'est infere.",
    );
    process.exit(1);
  }
}
