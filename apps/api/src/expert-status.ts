import { decodeJwt } from "jose";
import type { Channel } from "../../../packages/domain/src/index";
import {
  AuthError,
  MCP_SCOPES,
  authenticationPolicy,
  auth0Issuer,
  hasMfa,
  hasVerifiedAccount,
  hashSecret,
  isLocalSimulation,
  type AuthEnv,
  type McpIdentity,
} from "./auth";

const REVIEW_SCOPES = ["documents:read", "dispatches:read", "dispatches:send"];
const POSTAL_SCOPES = [
  "documents:write",
  "dispatches:prepare",
  "dispatches:send",
];

type Snapshot = {
  role: string;
  connection_id: string | null;
  connection_status: "active" | "revoked" | null;
  not_before: number | null;
  connection_count: number;
  enabled: number | null;
  revision: number | null;
  channels_json: string | null;
  max_per_dispatch_minor: number | null;
  max_daily_minor: number | null;
  max_daily_count: number | null;
  expires_at: string | null;
  policy_active: number;
  used_count: number;
  used_ceiling: number;
  postal_count: number;
  day: string;
  resets_at: string;
  checked_at: string;
};
export type ExpertStatus = {
  mode: string;
  state: "inactive" | "expired" | "revoked" | "active";
  canUseExpert: boolean;
  canTransferPostalDraft: boolean;
  code: string;
  title: string;
  message: string;
  nextAction:
    "continue" | "administrator_setup" | "reconnect" | "wait_until_reset";
  scopes: {
    granted: string[];
    required: string[];
    missing: string[];
    postalRequired: string[];
    postalMissing: string[];
  };
  channels: Channel[];
  limits: null | {
    currency: "EUR";
    maxPerDispatchMinor: number;
    maxDailyMinor: number;
    maxDailyCount: number;
  };
  daily: null | {
    day: string;
    resetsAt: string;
    usedCeilingMinor: number;
    remainingMinor: number;
    usedCount: number;
    remainingCount: number;
    postalDraftsUsed: number;
    postalDraftsRemaining: number;
  };
  expiresAt: string | null;
  policyRevision: number | null;
  checkedAt: string;
  accountUrl: string;
  usageBasis: string;
};

function invalid(): never {
  throw new AuthError(
    "EXPERT_STATUS_AUTHORITY_CHANGED",
    "Votre connexion ou vos droits ont changé. Reconnectez l’assistant pour consulter votre délégation.",
    403,
  );
}

/** Diagnostic only. identity originates in authenticateMcp, never in client JSON.
 * JWT claims were signature-verified there. Current credentials, identity,
 * membership, connection, policy and usage are fenced by one read-only snapshot.
 * Do not call authenticateMcp again here: it may create an absent connection. */
export async function getExpertStatus(
  identity: McpIdentity,
  env: AuthEnv,
): Promise<ExpertStatus> {
  const ctx = identity.context;
  if (ctx.actor !== "mcp") invalid();
  const development = identity.token.startsWith("gtn_dev_");
  let issuer: string | null = null;
  let issuedAt = 0;
  let credentialSql: string;
  let credentialValues: (string | number)[];
  if (development) {
    if (!isLocalSimulation(new Request(new URL("/mcp", env.APP_ORIGIN)), env))
      throw new AuthError(
        "DEVELOPMENT_AUTH_FORBIDDEN",
        "Authentification de développement interdite.",
        403,
      );
    if (identity.clientId !== "local-simulation") invalid();
    credentialSql = `EXISTS(SELECT 1 FROM development_mcp_tokens t WHERE t.token_hash=? AND t.organization_id=m.organization_id AND t.user_id=m.user_id AND t.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND unixepoch(t.expires_at)=?)`;
    credentialValues = [
      await hashSecret(identity.token),
      Math.floor(identity.expiresAt),
    ];
  } else {
    issuer = auth0Issuer(env);
    let claims: ReturnType<typeof decodeJwt>;
    try {
      claims = decodeJwt(identity.token);
    } catch {
      invalid();
    }
    const clientId =
      typeof claims.client_id === "string" ? claims.client_id : claims.azp;
    const scopes =
      typeof claims.scope === "string"
        ? claims.scope
            .split(" ")
            .filter((scope) =>
              (MCP_SCOPES as readonly string[]).includes(scope),
            )
        : [];
    if (
      claims.iss !== issuer ||
      clientId !== identity.clientId ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp !== identity.expiresAt ||
      JSON.stringify([...scopes].sort()) !==
        JSON.stringify([...identity.scopes].sort())
    )
      invalid();
    issuedAt = claims.iat!;
    const accountVerified =
      authenticationPolicy(env) === "verified_email"
        ? hasVerifiedAccount(claims)
        : ctx.role !== "admin" || hasMfa(claims);
    credentialSql = `EXISTS(SELECT 1 FROM auth_identities i WHERE i.issuer=? AND i.subject=? AND i.user_id=m.user_id) AND ?>unixepoch('now') AND ?=1`;
    credentialValues = [
      issuer,
      claims.sub,
      claims.exp!,
      Number(accountVerified),
    ];
  }
  // date('now') matches the acceptance trigger, including its UTC day boundary.
  // Multiple issuer matches in local fixtures remain explicitly unavailable.
  const row = await env.DB.prepare(
    `WITH connections AS (
      SELECT * FROM authorized_connections WHERE organization_id=? AND user_id=? AND client_id=? AND (? IS NULL OR issuer=?)
    ), current_connection AS (
      SELECT * FROM connections WHERE (SELECT count(*) FROM connections)=1
    )
    SELECT m.role,c.id connection_id,c.status connection_status,c.not_before,
      (SELECT count(*) FROM connections) connection_count,
      p.enabled,p.revision,p.channels_json,p.max_per_dispatch_minor,p.max_daily_minor,p.max_daily_count,p.expires_at,
      EXISTS(SELECT 1 FROM active_expert_approval_policies active WHERE active.connection_id=c.id AND active.organization_id=m.organization_id AND active.user_id=m.user_id AND active.client_id=? AND active.issuer=c.issuer AND active.revision=p.revision AND active.connection_updated_at=c.updated_at) policy_active,
      (SELECT count(*) FROM expert_approval_acceptances u WHERE u.organization_id=m.organization_id AND u.connection_id=c.id AND u.budget_day=date('now')) used_count,
      COALESCE((SELECT sum(u.ceiling_minor) FROM expert_approval_acceptances u WHERE u.organization_id=m.organization_id AND u.connection_id=c.id AND u.budget_day=date('now')),0) used_ceiling,
      (SELECT count(*) FROM postal_transfer_consents transfer WHERE transfer.organization_id=m.organization_id AND transfer.user_id=m.user_id AND transfer.expert_connection_id=c.id AND transfer.consent_kind='expert' AND transfer.created_at>=date('now')) postal_count,
      date('now') day,strftime('%Y-%m-%dT00:00:00.000Z','now','+1 day') resets_at,strftime('%Y-%m-%dT%H:%M:%fZ','now') checked_at
    FROM memberships m JOIN organizations o ON o.id=m.organization_id
    LEFT JOIN current_connection c ON c.organization_id=m.organization_id AND c.user_id=m.user_id
    LEFT JOIN expert_approval_policies p ON p.connection_id=c.id AND p.organization_id=m.organization_id AND p.user_id=m.user_id
    WHERE m.organization_id=? AND m.user_id=? AND m.role=? AND o.mode=? AND ${credentialSql}`,
  )
    .bind(
      ctx.organizationId,
      ctx.userId,
      identity.clientId,
      issuer,
      issuer,
      identity.clientId,
      ctx.organizationId,
      ctx.userId,
      ctx.role,
      env.MODE,
      ...credentialValues,
    )
    .first<Snapshot>();
  if (!row) invalid();
  const granted = [
    ...new Set(
      identity.scopes.filter((scope) =>
        (MCP_SCOPES as readonly string[]).includes(scope),
      ),
    ),
  ].sort();
  const missing = REVIEW_SCOPES.filter((scope) => !granted.includes(scope));
  const postalMissing = POSTAL_SCOPES.filter(
    (scope) => !granted.includes(scope),
  );
  const connectionCurrent =
    row.connection_status === "active" &&
    (development || (row.not_before ?? Infinity) <= issuedAt);
  // A stale credential or lost administrator role does not disclose an old policy.
  const disclosePolicy =
    connectionCurrent && row.role === "admin" && row.enabled !== null;
  const channels: Channel[] = disclosePolicy
    ? (JSON.parse(row.channels_json!) as unknown[]).filter(
        (channel): channel is Channel =>
          typeof channel === "string" &&
          ["fax", "email", "postal"].includes(channel),
      )
    : [];
  const limits: ExpertStatus["limits"] = disclosePolicy
    ? {
        currency: "EUR",
        maxPerDispatchMinor: row.max_per_dispatch_minor!,
        maxDailyMinor: row.max_daily_minor!,
        maxDailyCount: row.max_daily_count!,
      }
    : null;
  const daily: ExpertStatus["daily"] = limits
    ? {
        day: row.day,
        resetsAt: row.resets_at,
        usedCeilingMinor: row.used_ceiling,
        remainingMinor: Math.max(0, limits.maxDailyMinor - row.used_ceiling),
        usedCount: row.used_count,
        remainingCount: Math.max(0, limits.maxDailyCount - row.used_count),
        postalDraftsUsed: row.postal_count,
        postalDraftsRemaining: Math.max(
          0,
          limits.maxDailyCount - row.postal_count,
        ),
      }
    : null;
  let state: ExpertStatus["state"] = "inactive";
  let code = "delegation_missing";
  let title = "Mode expert non activé";
  let message =
    "Aucune délégation n’est active pour cette connexion. Un administrateur peut l’activer volontairement dans Mon compte, avec des canaux, des limites et une expiration. Vous pouvez aussi choisir la revue humaine pour cet envoi.";
  let nextAction: ExpertStatus["nextAction"] = "administrator_setup";
  if (!connectionCurrent) {
    state =
      row.connection_status === "revoked" || row.connection_status === "active"
        ? "revoked"
        : "inactive";
    code =
      row.connection_count > 1
        ? "connection_ambiguous"
        : row.connection_status === null
          ? "connection_missing"
          : "connection_changed";
    title = "Connexion à renouveler";
    message =
      "Reconnectez cet assistant à votre espace Guteneo. Une reconnexion ne réactive pas une ancienne délégation : un administrateur devra ensuite vérifier et réactiver volontairement le mode expert pour cette connexion.";
    nextAction = "reconnect";
  } else if (row.role !== "admin") {
    code = "administrator_required";
    message =
      "Le mode expert est réservé à une connexion appartenant à un administrateur. Demandez à un administrateur de configurer sa propre connexion, ou choisissez la revue humaine pour cet envoi.";
  } else if (row.enabled === 0) {
    state = "revoked";
    code = "delegation_revoked";
    title = "Délégation désactivée";
    message =
      "La délégation de cette connexion est désactivée, notamment après une révocation ou une reconnexion. Un administrateur doit la réactiver volontairement dans Mon compte pour reprendre le mode expert.";
  } else if (row.enabled === 1 && row.expires_at! <= row.checked_at) {
    state = "expired";
    code = "delegation_expired";
    title = "Délégation expirée";
    message =
      "Cette délégation a expiré. Un administrateur peut la renouveler volontairement dans Mon compte ; l’assistant ne peut pas la prolonger. La revue humaine reste une alternative pour cet envoi.";
  } else if (row.policy_active && channels.length) {
    state = "active";
    code = "delegation_active";
    title = "Mode expert actif";
    message =
      "La délégation est active pour cette connexion. Poursuivez la préparation et la revue de l’envoi ici, dans les canaux et plafonds autorisés. Les confirmations de l’hôte, la lecture du contenu exact et les contrôles du fournisseur restent obligatoires.";
    nextAction = "continue";
    if (missing.length) {
      code = "scopes_missing";
      title = "Permissions de connexion à compléter";
      message =
        "La délégation existe, mais cette connexion ne dispose pas de toutes les permissions nécessaires à la revue et à l’envoi expert. Reconnectez l’assistant avec les permissions manquantes, puis faites réactiver volontairement la délégation : la reconnexion désactive l’ancien mandat.";
      nextAction = "reconnect";
    } else if (
      !daily ||
      daily.remainingCount === 0 ||
      daily.remainingMinor === 0
    ) {
      code = "daily_limit_reached";
      title = "Limite quotidienne du mode expert atteinte";
      message =
        "Le nombre ou le budget quotidien des envois délégués est épuisé. Attendez la prochaine journée UTC indiquée, ou choisissez la revue humaine si les autres contrôles l’autorisent. L’assistant ne peut pas relever ces limites.";
      nextAction = "wait_until_reset";
    }
  }
  return {
    mode: env.MODE,
    state,
    canUseExpert:
      state === "active" &&
      missing.length === 0 &&
      Boolean(daily && daily.remainingCount > 0 && daily.remainingMinor > 0),
    canTransferPostalDraft:
      state === "active" &&
      channels.includes("postal") &&
      postalMissing.length === 0 &&
      Boolean(daily && daily.postalDraftsRemaining > 0),
    code,
    title,
    message,
    nextAction,
    scopes: {
      granted,
      required: [...REVIEW_SCOPES],
      missing,
      postalRequired: [...POSTAL_SCOPES],
      postalMissing,
    },
    channels,
    limits,
    daily,
    expiresAt: disclosePolicy ? row.expires_at : null,
    policyRevision: disclosePolicy ? row.revision : null,
    checkedAt: row.checked_at,
    accountUrl: `${env.APP_ORIGIN}/#/app/account${row.connection_id ? `?connection=${encodeURIComponent(row.connection_id)}` : ""}`,
    usageBasis:
      "Les montants sont des centimes EUR. Le budget cumule les plafonds des envois acceptés, pas leur coût final ; les brouillons postaux ont un compteur distinct. Ces disponibilités ne sont pas réservées : l’acceptation revérifie et consomme les limites atomiquement, avec les autres contrôles.",
  };
}
