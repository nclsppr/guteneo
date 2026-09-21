import {
  postalSetupInput,
  postalSenderSubmissionInput,
  type PostalSenderSubmissionInput,
  type PostalSetup,
} from "../../../packages/contracts/src/postal-setup";
import {
  canonicalJson,
  DomainError,
  sha256,
} from "../../../packages/domain/src/index";
import {
  postalPolicyOptions,
  postalRateEvidence,
} from "../../../packages/domain/src/live-delivery-quotes";
import { inspectPingenReadiness } from "../../../packages/providers/pingen-readiness";
import {
  PingenPostalProvider,
  type Fetcher,
} from "../../../packages/providers";
import {
  authenticateBrowser,
  authenticationPolicy,
  type AuthenticatedSession,
  type AuthContext,
  type McpIdentity,
  auth0Issuer,
} from "./auth";
import { liveSendingEnabled } from "./live-providers";
import type { Env } from "./env";
import { postalMcpAuthority, type PostalAuthority } from "./postal-authority";

const sourceReference = "https://api.pingen.com/documentation/swagger-docs";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function fail(code: string, message: string, status = 409): never {
  throw new DomainError(code, message, status);
}
type Sender = NonNullable<PostalSetup["sender"]>;
type Declaration = {
  sender_id: string;
  sender_name: string;
  sender_address: string;
  profile_json: string;
  submission_origin:
    "browser_administrator_declaration" | "oauth_administrator_submission";
};
type Profile = {
  accountId: string;
  billingCurrency: "EUR";
  defaultCountry: string;
  addressPosition: "left" | "right";
};
type Generation = {
  generation: number;
  policy_ids_json: string;
  profile_json: string;
  expires_at: string;
};
const latestGeneration = (env: Env, org: string) =>
  env.DB.prepare(
    "SELECT generation,policy_ids_json,profile_json,expires_at FROM postal_setup_policy_generations WHERE organization_id=? ORDER BY generation DESC LIMIT 1",
  )
    .bind(org)
    .first<Generation>();

type SetupAuthority = PostalAuthority & {
  readonly submission:
    | {
        origin: "browser_administrator_declaration";
        clientId: null;
        connectionId: null;
      }
    | {
        origin: "oauth_administrator_submission";
        clientId: string;
        connectionId: string;
      };
};

function browserSetupAuthority(
  request: Request,
  env: Env,
  session: AuthenticatedSession,
): SetupAuthority {
  const captured = new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
  });
  const context = Object.freeze({ ...session.context });
  return {
    context,
    submission: {
      origin: "browser_administrator_declaration",
      clientId: null,
      connectionId: null,
    },
    async assertCurrent() {
      const fresh = await authenticateBrowser(captured, env, true);
      if (
        fresh.context.organizationId !== context.organizationId ||
        fresh.context.userId !== context.userId ||
        fresh.context.role !== "admin" ||
        fresh.tokenHash !== session.tokenHash
      )
        fail(
          "ACCESS_CHANGED",
          "Vos droits ont changé. Actualisez la page.",
          403,
        );
    },
    sql() {
      return {
        condition: `EXISTS(SELECT 1 FROM memberships m JOIN browser_sessions s ON s.organization_id=m.organization_id AND s.user_id=m.user_id JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? AND m.role='admin' AND o.mode='production' AND s.token_hash=? AND s.csrf_token=? AND s.expires_at>? AND s.is_development=0 AND ${authenticationPolicy(env) === "verified_email" ? "s.verified_account=1" : "s.mfa=1"})`,
        values: [
          context.organizationId,
          context.userId,
          session.tokenHash,
          session.csrfToken,
          new Date().toISOString(),
        ],
      };
    },
  };
}

// Copy authority-bearing values before the first await. The caller's mutable
// identity object is never reused after authentication or provider inspection.
function captureIdentity(identity: McpIdentity): McpIdentity {
  return {
    ...identity,
    context: { ...identity.context },
    scopes: [...identity.scopes],
    ...(identity.connectionObservation
      ? { connectionObservation: { ...identity.connectionObservation } }
      : {}),
  };
}

export async function getPostalSetupForMcp(
  identity: McpIdentity,
  env: Env,
): Promise<PostalSetup> {
  const captured = captureIdentity(identity);
  const authority = await postalMcpAuthority(captured, env, "documents:read");
  const result = await current(
    env,
    authority.context,
    authority.context.role === "admin" &&
      captured.scopes.includes("dispatches:prepare"),
  );
  await authority.assertCurrent();
  return result;
}

/** A scoped OAuth administrator submits identity fields, never a human-consent
 * assertion. This prepares postal setup; transfer and approval remain separate. */
export async function configurePostalSenderForMcp(
  identity: McpIdentity,
  env: Env,
  input: PostalSenderSubmissionInput,
  dependencies: { fetcher?: Fetcher } = {},
): Promise<PostalSetup> {
  const captured = captureIdentity(identity);
  const parsed = postalSenderSubmissionInput.safeParse(input);
  if (!parsed.success)
    fail(
      "INVALID_INPUT",
      "Indiquez le nom et l’adresse complète de l’expéditeur.",
      400,
    );
  if (captured.context.role !== "admin")
    fail(
      "POSTAL_SENDER_ADMIN_REQUIRED",
      "Seul un administrateur de cet atelier peut ajouter un expéditeur postal.",
      403,
    );
  if (env.MODE !== "production" || env.ENVIRONMENT !== "production")
    fail(
      "POSTAL_SETUP_UNAVAILABLE",
      "L’activation du courrier est indisponible dans cet environnement.",
    );
  const base = await postalMcpAuthority(captured, env, "dispatches:prepare");
  const connection = await env.DB.prepare(
    "SELECT id FROM authorized_connections WHERE issuer=? AND user_id=? AND client_id=? AND organization_id=? AND status='active'",
  )
    .bind(
      auth0Issuer(env),
      base.context.userId,
      captured.clientId,
      base.context.organizationId,
    )
    .first<{ id: string }>();
  if (!connection)
    fail(
      "POSTAL_AUTHORITY_CHANGED",
      "Cette connexion n’est plus autorisée. Reconnectez votre assistant.",
      403,
    );
  const authority: SetupAuthority = {
    ...base,
    submission: {
      origin: "oauth_administrator_submission",
      clientId: captured.clientId,
      connectionId: connection.id,
    },
    sql() {
      const fence = base.sql();
      return {
        condition: `(${fence.condition}) AND EXISTS(SELECT 1 FROM memberships setup_member JOIN organizations setup_org ON setup_org.id=setup_member.organization_id WHERE setup_member.organization_id=? AND setup_member.user_id=? AND setup_member.role='admin' AND setup_org.mode='production')`,
        values: [
          ...fence.values,
          base.context.organizationId,
          base.context.userId,
        ],
      };
    },
  };
  return configure(env, authority, parsed.data, dependencies);
}

function available(env: Env): boolean {
  if (
    !liveSendingEnabled(env, "postal") ||
    env.PINGEN_SANDBOX !== "false" ||
    env.POSTAL_DRAFTS_ENABLED !== "true" ||
    !env.PINGEN_WEBHOOK_SECRET ||
    !["LU", "FR", "DE"].includes(env.PINGEN_DEFAULT_COUNTRY ?? "")
  )
    return false;
  try {
    // Constructor validates credentials, account ID and exact HTTPS upload origins;
    // it does not request a token or perform any provider operation.
    new PingenPostalProvider({
      clientId: env.PINGEN_CLIENT_ID ?? "",
      clientSecret: env.PINGEN_CLIENT_SECRET ?? "",
      organisationId: env.PINGEN_ORGANIZATION_ID ?? "",
      sandbox: false,
      uploadOrigins: (env.PINGEN_UPLOAD_ORIGINS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
    return true;
  } catch {
    return false;
  }
}

async function current(
  env: Env,
  context: AuthContext,
  canManage = context.role === "admin",
): Promise<PostalSetup> {
  const org = context.organizationId;
  const declaration = await env.DB.prepare(
    "SELECT sender_id,sender_name,sender_address,profile_json,submission_origin FROM postal_sender_declarations WHERE organization_id=?",
  )
    .bind(org)
    .first<Declaration>();
  const sender = declaration
    ? await env.DB.prepare(
        "SELECT id,name,address,status FROM senders WHERE organization_id=? AND id=? AND channel='postal' AND mode='production'",
      )
        .bind(org, declaration.sender_id)
        .first<Sender>()
    : await env.DB.prepare(
        "SELECT id,name,address,status FROM senders WHERE organization_id=? AND channel='postal' AND mode='production' ORDER BY created_at,id LIMIT 1",
      )
        .bind(org)
        .first<Sender>();
  const channel = await env.DB.prepare(
    "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='postal'",
  )
    .bind(org)
    .first<{ enabled: number }>();
  const stopped = await env.DB.prepare(
    "SELECT 1 FROM audit_log WHERE organization_id=? AND action='channel.control' AND resource_id='postal' AND json_extract(details_json,'$.enabled')=0 LIMIT 1",
  )
    .bind(org)
    .first();
  let configured = false;
  let pricingExpired = false;
  let revoked = false;
  let profileChanged = false;
  const generation = await latestGeneration(env, org);
  if (sender && declaration) {
    const profile = JSON.parse(declaration.profile_json) as Profile;
    profileChanged =
      profile.accountId !== env.PINGEN_ORGANIZATION_ID ||
      profile.defaultCountry !== env.PINGEN_DEFAULT_COUNTRY ||
      generation?.profile_json !== declaration.profile_json;
    const timestamp = new Date().toISOString();
    const policies = (
      await env.DB.prepare(
        "SELECT options_json,status,valid_from,expires_at FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=? AND channel='postal' AND provider='pingen' AND account_id=? AND route_id=? AND pricing_basis='public_list_price_ex_tax' AND source_reference=? AND id IN (SELECT value FROM json_each(?))",
      )
        .bind(
          org,
          sender.id,
          env.PINGEN_ORGANIZATION_ID ?? "",
          env.PINGEN_ORGANIZATION_ID ?? "",
          sourceReference,
          generation?.policy_ids_json ?? "[]",
        )
        .all<{
          options_json: string;
          status: string;
          valid_from: string;
          expires_at: string;
        }>()
    ).results;
    revoked = policies.some((policy) => policy.status === "revoked");
    const required = postalPolicyOptions(profile.addressPosition).map(
      canonicalJson,
    );
    const covered = required.every((options) =>
      policies.some(
        (policy) =>
          policy.options_json === options &&
          policy.status === "qualified" &&
          policy.valid_from <= timestamp &&
          policy.expires_at > timestamp,
      ),
    );
    pricingExpired = !revoked && policies.length >= 8 && !covered;
    configured =
      sender.status === "verified" &&
      sender.name === declaration.sender_name &&
      sender.address === declaration.sender_address &&
      profile.accountId === env.PINGEN_ORGANIZATION_ID &&
      profile.defaultCountry === env.PINGEN_DEFAULT_COUNTRY &&
      covered &&
      !revoked;
  }
  const serviceAvailable = available(env);
  const channelEnabled = channel?.enabled === 1;
  const reason: PostalSetup["reason"] = !serviceAvailable
    ? "service_unavailable"
    : sender?.status !== undefined && sender.status !== "verified"
      ? "sender_disabled"
      : !channelEnabled && (Boolean(declaration) || Boolean(stopped))
        ? "channel_stopped"
        : sender && (!declaration || !generation || revoked || profileChanged)
          ? "operator_review_required"
          : pricingExpired
            ? "pricing_expired"
            : !configured
              ? "setup_required"
              : undefined;
  return {
    available: serviceAvailable,
    canManage,
    configured,
    channelEnabled,
    ...(sender ? { sender } : {}),
    senderVerification: declaration
      ? declaration.submission_origin === "oauth_administrator_submission"
        ? "oauth_administrator_submission"
        : "administrator_declaration"
      : null,
    pricingBasis: "public_list_price_ex_tax",
    defaultCountry: env.PINGEN_DEFAULT_COUNTRY ?? "LU",
    ...(reason ? { reason } : {}),
  };
}

async function readInput(request: Request) {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    fail("INVALID_INPUT", "Une requête JSON est nécessaire.", 400);
  const reader = request.body?.getReader();
  if (!reader) fail("INVALID_INPUT", "Le formulaire est absent.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        fail("INVALID_INPUT", "Le formulaire est trop volumineux.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail("INVALID_INPUT", "Le formulaire est invalide.", 400);
  }
  const parsed = postalSetupInput.safeParse(value);
  if (!parsed.success)
    fail(
      "INVALID_INPUT",
      "Indiquez votre nom, votre adresse et votre autorisation.",
      400,
    );
  return parsed.data;
}

/** Browser-only identity declaration. No assistant, transfer, send or credit grant. */
export async function handlePostalSetupRoute(
  request: Request,
  env: Env,
  dependencies: { fetcher?: Fetcher } = {},
): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/postal/setup") return null;
  if (request.headers.has("Authorization"))
    fail(
      "BROWSER_REQUIRED",
      "Ouvrez Guteneo dans votre navigateur pour déclarer votre expéditeur.",
      403,
    );
  const session = await authenticateBrowser(
    request,
    env,
    !["GET", "HEAD", "OPTIONS"].includes(request.method),
  );
  const rate = await env.DB.prepare(
    "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,1) ON CONFLICT(organization_id,window_start) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(session.context.organizationId, Math.floor(Date.now() / 60000))
    .first<{ count: number }>();
  if ((rate?.count ?? 0) > 180)
    return json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Trop de requêtes. Réessayez dans une minute.",
        },
      },
      429,
    );
  if (request.method === "GET")
    return json(await current(env, session.context));
  if (request.method !== "POST")
    return json(
      {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Méthode non autorisée.",
        },
      },
      405,
    );
  if (session.context.role !== "admin")
    fail(
      "FORBIDDEN",
      "Seul un administrateur de cet atelier peut déclarer un expéditeur.",
      403,
    );
  const input = await readInput(request);
  return json(
    await configure(
      env,
      browserSetupAuthority(request, env, session),
      input,
      dependencies,
    ),
  );
}

async function configure(
  env: Env,
  authority: SetupAuthority,
  input: PostalSenderSubmissionInput,
  dependencies: { fetcher?: Fetcher },
): Promise<PostalSetup> {
  await authority.assertCurrent();
  if (!available(env))
    fail(
      "POSTAL_SETUP_UNAVAILABLE",
      "L’activation du courrier est temporairement indisponible.",
    );
  const state = await current(env, authority.context);
  if (
    state.sender &&
    (state.sender.name !== input.name || state.sender.address !== input.address)
  )
    fail(
      "POSTAL_SENDER_EXISTS",
      "Un expéditeur existe déjà. Sa déclaration ne peut pas être remplacée ici.",
    );
  if (
    ["sender_disabled", "channel_stopped", "operator_review_required"].includes(
      state.reason ?? "",
    )
  )
    fail(
      "POSTAL_SETUP_REVIEW_REQUIRED",
      "La configuration a été suspendue ou nécessite une vérification. Contactez l’administrateur.",
    );
  if (state.configured) {
    await authority.assertCurrent();
    return state;
  }
  const readiness = await inspectPingenReadiness(
    {
      clientId: env.PINGEN_CLIENT_ID!,
      clientSecret: env.PINGEN_CLIENT_SECRET!,
      organisationId: env.PINGEN_ORGANIZATION_ID!,
      sandbox: false,
    },
    dependencies.fetcher,
  );
  const provider = readiness.organisation;
  if (
    readiness.status !== "ok" ||
    !readiness.authenticated ||
    !provider?.configuredIdMatches ||
    provider.billingCurrency !== "EUR" ||
    provider.defaultCountry !== env.PINGEN_DEFAULT_COUNTRY ||
    !provider.defaultAddressPosition
  )
    fail(
      "POSTAL_PROFILE_UNQUALIFIED",
      "Le profil du service postal doit être vérifié avant l’activation.",
    );
  const profile: Profile = {
    accountId: env.PINGEN_ORGANIZATION_ID!,
    billingCurrency: "EUR",
    defaultCountry: provider.defaultCountry!,
    addressPosition: provider.defaultAddressPosition,
  };
  const org = authority.context.organizationId;
  const timestamp = new Date().toISOString();
  const expiry = new Date(Date.now() + 90 * 86400000).toISOString();
  const senderId = state.sender?.id ?? `sender_${crypto.randomUUID()}`;
  const auditId = `audit_${crypto.randomUUID()}`;
  const renew = Boolean(state.sender);
  const previous = await latestGeneration(env, org);
  if (renew && (!previous || previous.profile_json !== canonicalJson(profile)))
    fail(
      "POSTAL_SETUP_REVIEW_REQUIRED",
      "Le profil du service postal a changé. Sa configuration doit être vérifiée.",
    );
  const evidence = postalRateEvidence();
  const sourceHash = await sha256(canonicalJson({ rate: evidence, profile }));
  await authority.assertCurrent();
  const fence = authority.sql();
  const target = renew
    ? `EXISTS(SELECT 1 FROM postal_sender_declarations d JOIN senders s ON s.organization_id=d.organization_id AND s.id=d.sender_id JOIN channel_controls c ON c.organization_id=d.organization_id AND c.channel='postal' WHERE d.organization_id=? AND d.sender_id=? AND d.sender_name=? AND d.sender_address=? AND s.status='verified' AND s.name=d.sender_name AND s.address=d.sender_address AND c.enabled=1) AND (SELECT MAX(generation) FROM postal_setup_policy_generations WHERE organization_id=?)=? AND (SELECT COUNT(*) FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=? AND id IN (SELECT value FROM json_each(?)) AND status='qualified' AND expires_at<=?)=8`
    : `NOT EXISTS(SELECT 1 FROM postal_sender_declarations WHERE organization_id=?) AND NOT EXISTS(SELECT 1 FROM senders WHERE organization_id=? AND channel='postal' AND mode='production') AND EXISTS(SELECT 1 FROM channel_controls c WHERE c.organization_id=? AND c.channel='postal' AND (c.enabled=1 OR NOT EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=c.organization_id AND a.action='channel.control' AND a.resource_id='postal' AND json_extract(a.details_json,'$.enabled')=0)))`;
  const targetArgs = renew
    ? [
        org,
        senderId,
        input.name,
        input.address,
        org,
        previous!.generation,
        org,
        senderId,
        previous!.policy_ids_json,
        timestamp,
      ]
    : [org, org, org];
  const marker =
    "EXISTS(SELECT 1 FROM audit_log WHERE organization_id=? AND id=?)";
  const statements = [
    env.DB.prepare(
      `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,?,?,?,? WHERE (${fence.condition}) AND ${target}`,
    ).bind(
      auditId,
      org,
      authority.context.userId,
      renew ? "postal.setup.pricing_renewed" : "postal.sender.declared",
      senderId,
      canonicalJson({
        authorizationBasis:
          authority.submission.origin === "oauth_administrator_submission"
            ? "oauth_administrator_submission"
            : "authenticated_administrator_declaration",
        submissionOrigin: authority.submission.origin,
        ...(authority.submission.origin === "oauth_administrator_submission"
          ? {
              oauthClientId: authority.submission.clientId,
              oauthConnectionId: authority.submission.connectionId,
              humanConsentClaimed: false,
            }
          : {}),
        physicalAddressVerified: false,
        pricingBasis: "public_list_price_ex_tax",
      }),
      timestamp,
      ...fence.values,
      ...targetArgs,
    ),
  ];
  if (!renew)
    statements.push(
      env.DB.prepare(
        `INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) SELECT ?,?,'postal',?,?,'verified','production',? WHERE ${marker}`,
      ).bind(senderId, org, input.name, input.address, timestamp, org, auditId),
      env.DB.prepare(
        `INSERT INTO postal_sender_declarations(organization_id,sender_id,user_id,sender_name,sender_address,authorization_basis,physical_address_verified,profile_json,audit_id,created_at,submission_origin,oauth_client_id,oauth_connection_id) SELECT ?,?,?,?,?,'authenticated_administrator_declaration',0,?,?,?,?,?,? WHERE ${marker}`,
      ).bind(
        org,
        senderId,
        authority.context.userId,
        input.name,
        input.address,
        canonicalJson(profile),
        auditId,
        timestamp,
        authority.submission.origin,
        authority.submission.clientId,
        authority.submission.connectionId,
        org,
        auditId,
      ),
    );
  if (renew)
    statements.push(
      env.DB.prepare(
        `UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=? AND sender_id=? AND id IN (SELECT value FROM json_each(?)) AND ${marker}`,
      ).bind(org, senderId, previous!.policy_ids_json, org, auditId),
    );
  const policyIds: string[] = [];
  for (const options of postalPolicyOptions(profile.addressPosition)) {
    const policyId = `cost_${crypto.randomUUID()}`;
    policyIds.push(policyId);
    statements.push(
      env.DB.prepare(
        `INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at,pricing_basis) SELECT ?,?,?,'postal','pingen',?,?,?,?,0,0,1,'EUR','qualified_final_variable_cost',300,?,?,?,?,'qualified',?,'public_list_price_ex_tax' WHERE ${marker}`,
      ).bind(
        policyId,
        org,
        senderId,
        profile.accountId,
        profile.accountId,
        canonicalJson(options),
        canonicalJson(evidence),
        sourceReference,
        sourceHash,
        timestamp,
        expiry,
        timestamp,
        org,
        auditId,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO postal_setup_policy_generations(organization_id,generation,sender_id,policy_ids_json,profile_json,audit_id,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE ${marker}`,
    ).bind(
      org,
      (previous?.generation ?? 0) + 1,
      senderId,
      canonicalJson(policyIds),
      canonicalJson(profile),
      auditId,
      timestamp,
      expiry,
      org,
      auditId,
    ),
  );
  if (!renew)
    statements.push(
      env.DB.prepare(
        `UPDATE channel_controls SET enabled=1 WHERE organization_id=? AND channel='postal' AND ${marker}`,
      ).bind(org, org, auditId),
    );
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) {
    // Concurrent identical setup succeeds idempotently; stale/revoked authority
    // must still be reauthenticated before revealing the transaction result.
    await authority.assertCurrent();
    const latest = await current(env, authority.context);
    await authority.assertCurrent();
    if (
      authority.context.role === "admin" &&
      latest.configured &&
      latest.channelEnabled &&
      latest.sender?.name === input.name &&
      latest.sender.address === input.address
    )
      return latest;
    fail(
      "ACCESS_CHANGED",
      "Vos droits ou la configuration ont changé. Actualisez la page.",
    );
  }
  const latest = await current(env, authority.context);
  await authority.assertCurrent();
  return latest;
}
