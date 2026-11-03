import {
  documentAccessMode,
  documentSessionTimeSql,
} from "../../../packages/contracts/src/document-authentication";
import {
  type PersonalDocumentItem,
  type PersonalDocumentView,
  type SecureAuditEvent,
  type SecureDistributionPolicy,
  type SecureDocumentKind,
} from "../../../packages/contracts/src/secure-distribution";
import {
  PERSONAL_DOCUMENT_EXPIRING_DAYS,
  type PersonalDocumentCounts,
  type PersonalDocumentPage,
  type PersonalDocumentSort,
  type PersonalDocumentStatusFilter,
  type PersonalDocumentSummary,
} from "../../../packages/contracts/src/personal-documents";
import { DomainError, canonicalJson } from "../../../packages/domain/src/index";
import type { Env } from "./env";
import {
  requirePersonalDocumentAuthentication,
  type PersonalPrincipal,
} from "./personal-auth";
import {
  getSecureObject,
  putSecureObject,
  secureSha256,
} from "./secure-storage";
import {
  secureSharedBinding,
  type SecureDistributionRow,
  type SecurePageRow,
} from "./secure-distributions";
import {
  personalSessionFence as sessionFence,
  sensitiveSessionPolicy,
} from "./sensitive-session";

type PersonalRow = {
  id: string;
  user_id: string;
  source_organization_id: string;
  source_distribution_id: string;
  source_sha256: string;
  source_name: string;
  sender_name: string;
  policy_json: string;
  original_key: string;
  manifest_sha256: string;
  status: "active" | "deleted" | "expired";
  created_at: string;
  expires_at: string;
};
type DepositOperation = {
  id: string;
  organization_id: string;
  distribution_id: string;
  user_id: string;
  personal_document_id: string;
  status: string;
  lease_token: string;
  lease_expires_at: string;
  next_page: number;
  original_ready: number;
  auth_session_hash: string | null;
};
const now = () => new Date().toISOString();
const uid = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const unavailable = () =>
  new DomainError("NOT_FOUND", "Document unavailable.", 404);

/** Both categories in one row shape, always bound to the authenticated owner. */
type OwnerDocumentRow = {
  id: string;
  kind: SecureDocumentKind;
  created_at: string;
  expires_at: string;
  sort_expiry: string;
  sort_title: string;
  title: string;
  sender: string;
  bound: number;
  state: PersonalDocumentItem["status"];
  policy_json: string | null;
  deposited_id: string | null;
  deposited_status: string | null;
  deposited_expires_at: string | null;
};
const listOrder: Record<
  PersonalDocumentSort,
  {
    column: "created_at" | "sort_expiry" | "sort_title";
    direction: "ASC" | "DESC";
  }
> = {
  recent: { column: "created_at", direction: "DESC" },
  oldest: { column: "created_at", direction: "ASC" },
  expiry: { column: "sort_expiry", direction: "ASC" },
  title: { column: "sort_title", direction: "ASC" },
};
// SQLite's lower() folds ASCII only. Fold the accented letters of the four
// product languages too, so "été" finds "Été" and titles sort as people read.
const FOLDED_LETTERS: readonly [string, string][] = [
  ..."àáâãäåÀÁÂÃÄÅ"
    .split("")
    .map((letter) => [letter, "a"] as [string, string]),
  ..."çÇ".split("").map((letter) => [letter, "c"] as [string, string]),
  ..."èéêëÈÉÊË".split("").map((letter) => [letter, "e"] as [string, string]),
  ..."ìíîïÌÍÎÏ".split("").map((letter) => [letter, "i"] as [string, string]),
  ..."ñÑ".split("").map((letter) => [letter, "n"] as [string, string]),
  ..."òóôõöøÒÓÔÕÖØ"
    .split("")
    .map((letter) => [letter, "o"] as [string, string]),
  ..."ùúûüÙÚÛÜ".split("").map((letter) => [letter, "u"] as [string, string]),
  ..."ýÿÝŸ".split("").map((letter) => [letter, "y"] as [string, string]),
  ["æ", "ae"],
  ["Æ", "ae"],
  ["œ", "oe"],
  ["Œ", "oe"],
  ["ß", "ss"],
];
const foldedSql = (expression: string) =>
  FOLDED_LETTERS.reduce(
    (sql, [letter, base]) => `replace(${sql},'${letter}','${base}')`,
    `lower(${expression})`,
  );
export function foldedSearch(value: string) {
  return FOLDED_LETTERS.reduce(
    (text, [letter, base]) => text.replaceAll(letter, base),
    value.toLowerCase(),
  )
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
const expiringBefore = (at: string) =>
  new Date(
    Date.parse(at) + PERSONAL_DOCUMENT_EXPIRING_DAYS * 86_400_000,
  ).toISOString();
// The state expressions mirror item(): expiry/revocation take precedence;
// a current unbound share stays pending and always keeps its title hidden.
function ownerDocuments(userId: string, at: string, kind?: SecureDocumentKind) {
  const shared = `SELECT s.id,'shared' AS kind,s.activated_at AS created_at,s.expires_at,COALESCE(s.expires_at,s.activated_at) AS sort_expiry,CASE WHEN s.bound_at IS NOT NULL THEN ${foldedSql("s.source_name")} ELSE '' END AS sort_title,CASE WHEN s.bound_at IS NOT NULL THEN s.source_name ELSE '' END AS title,COALESCE(o.name,'Guteneo workspace') AS sender,s.bound_at IS NOT NULL AS bound,CASE WHEN s.status='revoked' THEN 'revoked' WHEN s.expires_at IS NULL OR s.expires_at<=? THEN 'expired' WHEN s.bound_at IS NOT NULL THEN 'active' ELSE 'pending' END AS state,s.policy_json,p.id AS deposited_id,p.status AS deposited_status,p.expires_at AS deposited_expires_at FROM secure_distributions s LEFT JOIN organizations o ON o.id=s.organization_id LEFT JOIN secure_personal_documents p ON p.user_id=s.recipient_user_id AND p.source_organization_id=s.organization_id AND p.source_distribution_id=s.id WHERE s.recipient_user_id=? AND s.activated_at IS NOT NULL`;
  const personal = `SELECT id,'personal' AS kind,created_at,expires_at,expires_at AS sort_expiry,${foldedSql("source_name")} AS sort_title,source_name AS title,sender_name AS sender,1 AS bound,CASE WHEN status='active' AND expires_at>? THEN 'active' ELSE 'expired' END AS state,NULL AS policy_json,NULL AS deposited_id,NULL AS deposited_status,NULL AS deposited_expires_at FROM secure_personal_documents WHERE user_id=? AND status<>'deleted'`;
  if (kind === "shared") return { sql: shared, values: [at, userId] };
  if (kind === "personal") return { sql: personal, values: [at, userId] };
  return {
    sql: `${shared} UNION ALL ${personal}`,
    values: [at, userId, at, userId],
  };
}
function listFilter(
  query: { status?: PersonalDocumentStatusFilter; sender?: string },
  search: string,
  at: string,
) {
  const conditions = [
    `(?='' OR instr(${foldedSql("title")},?)>0 OR instr(${foldedSql("sender")},?)>0)`,
  ];
  const values: string[] = [search, search, search];
  if (query.status === "available") conditions.push("state='active'");
  else if (query.status === "pending") conditions.push("state='pending'");
  else if (query.status === "expiring") {
    conditions.push("state='active' AND expires_at<=?");
    values.push(expiringBefore(at));
  } else if (query.status === "ended")
    conditions.push("state IN ('expired','revoked')");
  if (query.sender !== undefined) {
    conditions.push("sender=?");
    values.push(query.sender);
  }
  return { sql: conditions.join(" AND "), values };
}
function encodeListCursor(
  sort: PersonalDocumentSort,
  value: string,
  id: string,
) {
  // Recency keeps the original cursor shape so earlier pages stay valid.
  const payload =
    sort === "recent" ? { createdAt: value, id } : { sort, value, id };
  return btoa(
    Array.from(new TextEncoder().encode(JSON.stringify(payload)), (byte) =>
      String.fromCharCode(byte),
    ).join(""),
  );
}
function decodeListCursor(cursor: string, sort: PersonalDocumentSort) {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(cursor), (character) => character.charCodeAt(0)),
      ),
    );
    if (!parsed || typeof parsed !== "object") throw new Error();
    const fields = parsed as Record<string, unknown>;
    const legacy =
      fields.sort === undefined && typeof fields.createdAt === "string";
    const value = legacy ? fields.createdAt : fields.value;
    if (
      (legacy ? "recent" : fields.sort) !== sort ||
      typeof value !== "string" ||
      typeof fields.id !== "string"
    )
      throw new Error();
    return { value, id: fields.id };
  } catch {
    throw new DomainError("INVALID_CURSOR", "Invalid cursor.");
  }
}
function ownerDocumentItem(
  row: OwnerDocumentRow,
  at: string,
): PersonalDocumentItem {
  if (row.kind === "personal")
    return {
      id: row.id,
      kind: "personal",
      title: row.title,
      sender: row.sender,
      status: row.state === "active" ? "active" : "expired",
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      allowOriginalDownload: true,
      allowVaultDeposit: false,
    };
  const policy: SecureDistributionPolicy = JSON.parse(row.policy_json ?? "{}");
  return {
    id: row.id,
    kind: "shared",
    title: row.bound ? row.title : "Document awaiting verification",
    sender: row.sender,
    status: row.state,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    allowOriginalDownload: policy.allowOriginalDownload,
    allowVaultDeposit: policy.allowVaultDeposit && !row.deposited_id,
    ...(row.deposited_id &&
    row.deposited_status === "active" &&
    (row.deposited_expires_at ?? "") > at
      ? { depositedDocumentId: row.deposited_id }
      : {}),
  };
}
function personalBinding(userId: string, documentId: string, suffix: string) {
  return `personal:${userId}:${documentId}:${suffix}`;
}
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
};

export class PersonalDocumentsService {
  constructor(public readonly env: Env) {}
  private async rate(principal: PersonalPrincipal) {
    requirePersonalDocumentAuthentication(principal, this.env);
    const hash = await secureSha256(`personal-documents:${principal.userId}`),
      window = Math.floor(Date.now() / 60000),
      fence = sessionFence(principal, 900, this.env);
    const count = await this.env.DB.prepare(
      `INSERT INTO secure_document_rate_limits(scope_hash,window,count) SELECT ?,?,1 WHERE ${fence.condition} ON CONFLICT(scope_hash,window) DO UPDATE SET count=count+1 RETURNING count`,
    )
      .bind(hash, window, ...fence.values)
      .first<{ count: number }>();
    if (!count)
      throw new DomainError(
        documentAccessMode(this.env.SENSITIVE_DOCUMENT_AUTHENTICATION) ===
          "verified_account"
          ? "DOCUMENT_AUTHENTICATION_REQUIRED"
          : "STRONG_AUTHENTICATION_REQUIRED",
        "Sign in again to access your documents.",
        403,
      );
    if (count.count > 180)
      throw new DomainError(
        "RATE_LIMITED",
        "Too many requests. Try again in a minute.",
        429,
      );
  }
  async claim(principal: PersonalPrincipal, token: string) {
    await this.rate(principal);
    const row = await this.env.DB.prepare(
      "SELECT * FROM secure_distributions WHERE token_hash=? AND status='active' AND expires_at>?",
    )
      .bind(await secureSha256(token), now())
      .first<SecureDistributionRow>();
    if (
      !row ||
      row.recipient_address !== principal.email?.toLowerCase() ||
      (row.recipient_user_id && row.recipient_user_id !== principal.userId)
    )
      throw unavailable();
    const fence = sessionFence(principal, 900, this.env);
    const automatic =
      JSON.parse(row.policy_json).recipientBinding === "verified_email";
    const results = await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE secure_distributions SET recipient_user_id=?,claimed_at=COALESCE(claimed_at,?),
      bound_at=CASE WHEN ?=1 THEN COALESCE(bound_at,?) ELSE bound_at END,
      binding_method=CASE WHEN ?=1 AND bound_at IS NULL THEN 'verified_email' ELSE binding_method END,
      binding_by=CASE WHEN ?=1 AND bound_at IS NULL THEN ? ELSE binding_by END
      WHERE organization_id=? AND id=? AND status='active' AND expires_at>? AND recipient_address=?
      AND (recipient_user_id IS NULL OR recipient_user_id=?)
      AND (?=0 OR json_extract(policy_json,'$.recipientBinding')='verified_email')
      AND ${fence.condition} RETURNING id,bound_at`,
      ).bind(
        principal.userId,
        now(),
        automatic ? 1 : 0,
        now(),
        automatic ? 1 : 0,
        automatic ? 1 : 0,
        principal.userId,
        row.organization_id,
        row.id,
        now(),
        principal.email!.toLowerCase(),
        principal.userId,
        automatic ? 1 : 0,
        ...fence.values,
      ),
      this.env.DB.prepare(
        `INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,created_at)
        SELECT ?,?,?,?,?, 'recipient_association_requested','server',? WHERE EXISTS(SELECT 1 FROM secure_distributions WHERE organization_id=? AND id=? AND recipient_user_id=? AND status='active' AND expires_at>?) AND ${fence.condition}`,
      ).bind(
        `secure_claim_${row.id}_${principal.userId}`,
        row.organization_id,
        row.id,
        principal.userId,
        principal.tokenHash,
        now(),
        row.organization_id,
        row.id,
        principal.userId,
        now(),
        ...fence.values,
      ),
      this.env.DB.prepare(
        `INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,created_at)
        SELECT ?,?,?,?,?,'recipient_verified_email_bound','server',? WHERE EXISTS(SELECT 1 FROM secure_distributions WHERE organization_id=? AND id=? AND recipient_user_id=? AND binding_by=? AND binding_method='verified_email' AND bound_at IS NOT NULL AND status='active' AND expires_at>?) AND ${fence.condition}`,
      ).bind(
        `secure_verified_claim_${row.id}_${principal.userId}`,
        row.organization_id,
        row.id,
        principal.userId,
        principal.tokenHash,
        now(),
        row.organization_id,
        row.id,
        principal.userId,
        principal.userId,
        now(),
        ...fence.values,
      ),
    ]);
    const claimed = results[0].results[0] as
      { id: string; bound_at: string | null } | undefined;
    if (!claimed) throw unavailable();
    return {
      id: row.id,
      status: claimed.bound_at ? "active" : "pending",
      recipientBinding: claimed.bound_at ? "confirmed" : "pending",
    };
  }
  private async shared(
    principal: PersonalPrincipal,
    id: string,
    allowPending = false,
  ) {
    const row = await this.env.DB.prepare(
      "SELECT * FROM secure_distributions WHERE id=? AND recipient_user_id=?",
    )
      .bind(id, principal.userId)
      .first<SecureDistributionRow>();
    if (
      !row ||
      (!allowPending &&
        (!row.bound_at ||
          row.status !== "active" ||
          !row.expires_at ||
          row.expires_at <= now()))
    )
      throw unavailable();
    return row;
  }
  private async personal(
    principal: PersonalPrincipal,
    id: string,
    allowInactive = false,
  ) {
    const row = await this.env.DB.prepare(
      "SELECT * FROM secure_personal_documents WHERE user_id=? AND id=?",
    )
      .bind(principal.userId, id)
      .first<PersonalRow>();
    if (
      !row ||
      (!allowInactive && (row.status !== "active" || row.expires_at <= now()))
    )
      throw unavailable();
    return row;
  }
  private async item(
    principal: PersonalPrincipal,
    id: string,
  ): Promise<PersonalDocumentItem> {
    if (id.startsWith("pd_")) {
      const row = await this.personal(principal, id, true);
      return {
        id: row.id,
        kind: "personal",
        title: row.source_name,
        sender: row.sender_name,
        status:
          row.status === "active" && row.expires_at > now()
            ? "active"
            : row.status === "deleted"
              ? "revoked"
              : "expired",
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        allowOriginalDownload: true,
        allowVaultDeposit: false,
      };
    }
    const row = await this.shared(principal, id, true),
      policy: SecureDistributionPolicy = JSON.parse(row.policy_json);
    const sender = await this.env.DB.prepare(
      "SELECT name FROM organizations WHERE id=?",
    )
      .bind(row.organization_id)
      .first<{ name: string }>();
    const deposited = await this.env.DB.prepare(
      "SELECT id,status,expires_at FROM secure_personal_documents WHERE user_id=? AND source_organization_id=? AND source_distribution_id=?",
    )
      .bind(principal.userId, row.organization_id, row.id)
      .first<{ id: string; status: string; expires_at: string }>();
    const status =
      row.status === "revoked"
        ? "revoked"
        : !row.expires_at || row.expires_at <= now()
          ? "expired"
          : row.bound_at
            ? "active"
            : "pending";
    return {
      id: row.id,
      kind: "shared",
      title: row.bound_at ? row.source_name : "Document awaiting verification",
      sender: sender?.name ?? "Guteneo workspace",
      status,
      expiresAt: row.expires_at!,
      createdAt: row.activated_at!,
      allowOriginalDownload: policy.allowOriginalDownload,
      allowVaultDeposit: policy.allowVaultDeposit && !deposited,
      ...(deposited?.status === "active" && deposited.expires_at > now()
        ? { depositedDocumentId: deposited.id }
        : {}),
    };
  }
  async list(
    principal: PersonalPrincipal,
    query: {
      cursor?: string;
      limit?: number;
      kind?: SecureDocumentKind;
      q?: string;
      status?: PersonalDocumentStatusFilter;
      sender?: string;
      sort?: PersonalDocumentSort;
    } = {},
  ): Promise<PersonalDocumentPage> {
    await this.rate(principal);
    const sort = query.sort ?? "recent";
    const order = listOrder[sort];
    const after = query.cursor ? decodeListCursor(query.cursor, sort) : null;
    const limit = Math.min(50, Math.max(1, query.limit ?? 30));
    const search = foldedSearch((query.q ?? "").trim().slice(0, 200));
    const at = now();
    const source = ownerDocuments(principal.userId, at, query.kind);
    const filter = listFilter(query, search, at);
    const comparison = order.direction === "DESC" ? "<" : ">";
    const keyset = after
      ? `AND (${order.column}${comparison}? OR (${order.column}=? AND id${comparison}?))`
      : "";
    const [rows, count] = await Promise.all([
      this.env.DB.prepare(
        `SELECT * FROM (${source.sql}) WHERE ${filter.sql} ${keyset} ORDER BY ${order.column} ${order.direction},id ${order.direction} LIMIT ?`,
      )
        .bind(
          ...source.values,
          ...filter.values,
          ...(after ? [after.value, after.value, after.id] : []),
          limit + 1,
        )
        .all<OwnerDocumentRow>(),
      this.env.DB.prepare(
        `SELECT count(*) AS total FROM (${source.sql}) WHERE ${filter.sql}`,
      )
        .bind(...source.values, ...filter.values)
        .first<{ total: number }>(),
    ]);
    const slice = rows.results.slice(0, limit),
      last = slice.at(-1);
    return {
      // One query hydrates the whole page; no per-document lookups.
      items: slice.map((row) => ownerDocumentItem(row, at)),
      nextCursor:
        rows.results.length > limit && last
          ? encodeListCursor(sort, last[order.column], last.id)
          : null,
      total: count?.total ?? 0,
    };
  }
  async summary(
    principal: PersonalPrincipal,
  ): Promise<PersonalDocumentSummary> {
    await this.rate(principal);
    const at = now(),
      soon = expiringBefore(at);
    const counts = (kind: SecureDocumentKind) => {
      const source = ownerDocuments(principal.userId, at, kind);
      return this.env.DB.prepare(
        `SELECT count(*) AS total,COALESCE(sum(state='active'),0) AS available,COALESCE(sum(state='pending'),0) AS pending,COALESCE(sum(state='active' AND expires_at<=?),0) AS expiring,COALESCE(sum(state IN ('expired','revoked')),0) AS ended FROM (${source.sql})`,
      )
        .bind(soon, ...source.values)
        .first<PersonalDocumentCounts>();
    };
    const all = ownerDocuments(principal.userId, at);
    const [shared, personal, senders, senderCount] = await Promise.all([
      counts("shared"),
      counts("personal"),
      this.env.DB.prepare(
        `SELECT sender AS name,count(*) AS documents FROM (${all.sql}) GROUP BY sender ORDER BY documents DESC,sender LIMIT 100`,
      )
        .bind(...all.values)
        .all<{ name: string; documents: number }>(),
      this.env.DB.prepare(
        `SELECT count(DISTINCT sender) AS total FROM (${all.sql})`,
      )
        .bind(...all.values)
        .first<{ total: number }>(),
    ]);
    const empty = { total: 0, available: 0, pending: 0, expiring: 0, ended: 0 };
    return {
      shared: shared ?? empty,
      personal: personal ?? empty,
      senders: senders.results,
      sendersTotal: senderCount?.total ?? 0,
      expiringDays: PERSONAL_DOCUMENT_EXPIRING_DAYS,
    };
  }
  async events(
    principal: PersonalPrincipal,
    id: string,
    query: { cursor?: string; limit?: number } = {},
  ) {
    await this.rate(principal);
    const personal = id.startsWith("pd_"),
      row = personal
        ? await this.personal(principal, id, true)
        : await this.shared(principal, id, true);
    let after: { createdAt: string; id: string } | null = null;
    if (query.cursor)
      try {
        after = JSON.parse(atob(query.cursor));
        if (
          !after ||
          typeof after.id !== "string" ||
          typeof after.createdAt !== "string"
        )
          throw new Error();
      } catch {
        throw new DomainError("INVALID_CURSOR", "Invalid cursor.");
      }
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const scope = personal
      ? "personal_document_id=? AND user_id=?"
      : "organization_id=? AND distribution_id=? AND (user_id=? OR type IN ('distribution_activated','access_revoked','recipient_binding_confirmed'))";
    const values = personal
      ? [id, principal.userId]
      : [(row as SecureDistributionRow).organization_id, id, principal.userId];
    const events = await this.env.DB.prepare(
      `SELECT id,type,created_at,provenance,page_number FROM secure_document_events WHERE ${scope} ${after ? "AND (created_at<? OR (created_at=? AND id<?))" : ""} ORDER BY created_at DESC,id DESC LIMIT ?`,
    )
      .bind(
        ...values,
        ...(after ? [after.createdAt, after.createdAt, after.id] : []),
        limit + 1,
      )
      .all<{
        id: string;
        type: string;
        created_at: string;
        provenance: SecureAuditEvent["provenance"];
        page_number: number | null;
      }>();
    const slice = events.results.slice(0, limit),
      last = slice.at(-1);
    return {
      items: slice.map((event) => ({
        id: event.id,
        type: event.type,
        createdAt: event.created_at,
        provenance: event.provenance,
        ...(event.page_number ? { page: event.page_number } : {}),
      })),
      nextCursor:
        events.results.length > limit && last
          ? btoa(JSON.stringify({ createdAt: last.created_at, id: last.id }))
          : null,
    };
  }
  async get(
    principal: PersonalPrincipal,
    id: string,
  ): Promise<PersonalDocumentView> {
    await this.rate(principal);
    const item = await this.item(principal, id);
    if (item.status !== "active")
      return {
        ...item,
        pages: [],
        audit: [],
        policy: id.startsWith("pd_")
          ? JSON.parse((await this.personal(principal, id, true)).policy_json)
          : JSON.parse((await this.shared(principal, id, true)).policy_json),
      };
    const isPersonal = item.kind === "personal";
    const row = isPersonal
      ? await this.personal(principal, id)
      : await this.shared(principal, id);
    const pages = isPersonal
      ? await this.env.DB.prepare(
          "SELECT * FROM secure_personal_pages WHERE user_id=? AND personal_document_id=? ORDER BY page_number",
        )
          .bind(principal.userId, id)
          .all<SecurePageRow>()
      : await this.env.DB.prepare(
          "SELECT * FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? ORDER BY page_number",
        )
          .bind((row as SecureDistributionRow).organization_id, id)
          .all<SecurePageRow>();
    const events = await this.events(principal, id, { limit: 100 });
    return {
      ...item,
      policy: JSON.parse(row.policy_json),
      pages: pages.results.map((page) => ({
        number: page.page_number,
        width: page.width,
        height: page.height,
        url: `/api/personal/documents/${id}/pages/${page.page_number}`,
        textUrl: `/api/personal/documents/${id}/pages/${page.page_number}/text`,
        accessibleText: "",
      })),
      audit: events.items,
      auditNextCursor: events.nextCursor,
    };
  }
  /** The audit insert is the authorization decision and rechecks the session and
   * grant in the same primary write. Decryption alone never authorizes a response. */
  private async authorize(
    principal: PersonalPrincipal,
    id: string,
    type: string,
    page?: number,
  ) {
    requirePersonalDocumentAuthentication(principal, this.env);
    const eventId = uid("sev"),
      fence = sessionFence(
        principal,
        type.startsWith("original_") ? 300 : 900,
        this.env,
      );
    const personal = id.startsWith("pd_");
    const sql = personal
      ? `INSERT INTO secure_document_events(id,personal_document_id,user_id,session_hash,type,provenance,page_number,created_at)
      SELECT ?,d.id,?,?,?,'server',?,? FROM secure_personal_documents d WHERE d.user_id=? AND d.id=? AND d.status='active' AND d.expires_at>? AND ${fence.condition} RETURNING id`
      : `INSERT INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,page_number,created_at)
      SELECT ?,d.organization_id,d.id,?,?,?,'server',?,? FROM secure_distributions d WHERE d.recipient_user_id=? AND d.id=? AND d.bound_at IS NOT NULL AND d.status='active' AND d.expires_at>? AND ${fence.condition} RETURNING id`;
    const record = await this.env.DB.prepare(sql)
      .bind(
        eventId,
        principal.userId,
        principal.tokenHash,
        type,
        page ?? null,
        now(),
        principal.userId,
        id,
        now(),
        ...fence.values,
      )
      .first();
    if (!record) throw unavailable();
  }
  async page(
    principal: PersonalPrincipal,
    id: string,
    pageNumber: number,
    text = false,
  ) {
    await this.rate(principal);
    const personal = id.startsWith("pd_");
    const row = personal
      ? await this.personal(principal, id)
      : await this.shared(principal, id);
    const page = personal
      ? await this.env.DB.prepare(
          "SELECT * FROM secure_personal_pages WHERE user_id=? AND personal_document_id=? AND page_number=?",
        )
          .bind(principal.userId, id, pageNumber)
          .first<SecurePageRow>()
      : await this.env.DB.prepare(
          "SELECT * FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? AND page_number=?",
        )
          .bind((row as SecureDistributionRow).organization_id, id, pageNumber)
          .first<SecurePageRow>();
    if (!page) throw unavailable();
    const suffix = `page:${pageNumber}:${text ? "text" : "image"}`;
    const object = await getSecureObject(
      this.env,
      text ? page.text_key : page.image_key,
      personal
        ? personalBinding(principal.userId, id, suffix)
        : secureSharedBinding(row as SecureDistributionRow, suffix),
      text ? page.text_sha256 : page.image_sha256,
    );
    await this.authorize(
      principal,
      id,
      text ? "accessible_text_access_authorized" : "page_access_authorized",
      pageNumber,
    );
    return text
      ? Response.json(
          { text: new TextDecoder().decode(object.bytes) },
          { headers },
        )
      : new Response(new Uint8Array(object.bytes).buffer, {
          headers: { ...headers, "Content-Type": "image/jpeg" },
        });
  }
  async displayEvent(principal: PersonalPrincipal, id: string, page: number) {
    await this.rate(principal);
    const personal = id.startsWith("pd_");
    const row = personal
      ? await this.personal(principal, id)
      : await this.shared(principal, id);
    const fence = sessionFence(principal, 900, this.env),
      eventId = uid("sev");
    const authorized = personal
      ? await this.env.DB.prepare(
          `INSERT INTO secure_document_events(id,personal_document_id,user_id,session_hash,type,provenance,page_number,created_at)
      SELECT ?,?,?,?,?, 'browser',?,? WHERE EXISTS(SELECT 1 FROM secure_personal_documents d JOIN secure_personal_pages p ON p.user_id=d.user_id AND p.personal_document_id=d.id WHERE d.user_id=? AND d.id=? AND d.status='active' AND d.expires_at>? AND p.page_number=?) AND ${fence.condition} RETURNING id`,
        )
          .bind(
            eventId,
            id,
            principal.userId,
            principal.tokenHash,
            "page_displayed",
            page,
            now(),
            principal.userId,
            id,
            now(),
            page,
            ...fence.values,
          )
          .first()
      : await this.env.DB.prepare(
          `INSERT INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,page_number,created_at)
      SELECT ?,?,?,?,?,?,'browser',?,? WHERE EXISTS(SELECT 1 FROM secure_distributions d JOIN secure_distribution_pages p ON p.organization_id=d.organization_id AND p.distribution_id=d.id WHERE d.organization_id=? AND d.id=? AND d.recipient_user_id=? AND d.bound_at IS NOT NULL AND d.status='active' AND d.expires_at>? AND p.page_number=?) AND ${fence.condition} RETURNING id`,
        )
          .bind(
            eventId,
            (row as SecureDistributionRow).organization_id,
            id,
            principal.userId,
            principal.tokenHash,
            "page_displayed",
            page,
            now(),
            (row as SecureDistributionRow).organization_id,
            id,
            principal.userId,
            now(),
            page,
            ...fence.values,
          )
          .first();
    if (!authorized) throw unavailable();
    return { recorded: true, provenance: "browser" };
  }
  async download(principal: PersonalPrincipal, id: string) {
    await this.rate(principal);
    requirePersonalDocumentAuthentication(principal, this.env, {
      maxAgeSeconds: 300,
    });
    const personal = id.startsWith("pd_"),
      row = personal
        ? await this.personal(principal, id)
        : await this.shared(principal, id);
    if (
      !personal &&
      !(JSON.parse(row.policy_json) as SecureDistributionPolicy)
        .allowOriginalDownload
    )
      throw new DomainError(
        "ORIGINAL_DOWNLOAD_FORBIDDEN",
        "Downloading the original PDF is not authorized.",
        403,
      );
    const object = await getSecureObject(
      this.env,
      row.original_key!,
      personal
        ? personalBinding(principal.userId, id, "original")
        : secureSharedBinding(row as SecureDistributionRow, "original"),
      row.source_sha256,
    );
    await this.authorize(principal, id, "original_download_requested");
    await this.authorize(principal, id, "original_transfer_started");
    return new Response(new Uint8Array(object.bytes).buffer, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(row.source_name)}`,
      },
    });
  }
  async deposit(principal: PersonalPrincipal, id: string) {
    await this.rate(principal);
    requirePersonalDocumentAuthentication(principal, this.env, {
      maxAgeSeconds: 300,
    });
    const row = await this.shared(principal, id),
      policy: SecureDistributionPolicy = JSON.parse(row.policy_json);
    if (!policy.allowVaultDeposit)
      throw new DomainError(
        "PERSONAL_COPY_FORBIDDEN",
        "The workspace has not authorized a personal copy.",
        403,
      );
    const existing = await this.env.DB.prepare(
      "SELECT id,status,expires_at FROM secure_personal_documents WHERE user_id=? AND source_organization_id=? AND source_distribution_id=?",
    )
      .bind(principal.userId, row.organization_id, id)
      .first<{ id: string; status: string; expires_at: string }>();
    if (existing) {
      if (existing.status !== "active" || existing.expires_at <= now())
        throw new DomainError(
          "PERSONAL_COPY_UNAVAILABLE",
          "The copy is no longer available.",
          410,
        );
      return {
        id: existing.id,
        status: existing.status,
        expiresAt: existing.expires_at,
      };
    }
    const operationId = uid("deposit"),
      personalId = uid("pd"),
      time = now(),
      fence = sessionFence(principal, 300, this.env);
    await this.env.DB.prepare(
      `INSERT INTO secure_deposit_operations(id,organization_id,distribution_id,user_id,personal_document_id,status,created_at,updated_at,lease_token,lease_expires_at,auth_session_hash)
      SELECT ?,?,?,?,?,'preparing',?,?,'',?,? WHERE ${fence.condition} ON CONFLICT(organization_id,distribution_id,user_id) DO NOTHING`,
    )
      .bind(
        operationId,
        row.organization_id,
        id,
        principal.userId,
        personalId,
        time,
        time,
        time,
        principal.tokenHash,
        ...fence.values,
      )
      .run();
    const operation = await this.env.DB.prepare(
      "SELECT * FROM secure_deposit_operations WHERE organization_id=? AND distribution_id=? AND user_id=?",
    )
      .bind(row.organization_id, id, principal.userId)
      .first<DepositOperation>();
    if (!operation || operation.status === "aborted")
      throw new DomainError(
        "PERSONAL_COPY_UNAVAILABLE",
        "The copy is no longer available.",
        409,
      );
    await this.env.DB.prepare(
      `UPDATE secure_deposit_operations SET auth_session_hash=? WHERE id=? AND status='preparing' AND lease_expires_at<=? AND ${fence.condition}`,
    )
      .bind(principal.tokenHash, operation.id, time, ...fence.values)
      .run();
    await this.processDeposit(operation.id);
    const completed = await this.env.DB.prepare(
      "SELECT id,status,expires_at FROM secure_personal_documents WHERE user_id=? AND id=?",
    )
      .bind(principal.userId, operation.personal_document_id)
      .first<{ id: string; status: string; expires_at: string }>();
    return completed
      ? {
          id: completed.id,
          status: completed.status,
          expiresAt: completed.expires_at,
        }
      : {
          id: operation.personal_document_id,
          status: "preparing",
          expiresAt: null,
        };
  }
  async processDeposit(operationId: string) {
    const lease = uid("lease"),
      time = now();
    const operation = await this.env.DB.prepare(
      `UPDATE secure_deposit_operations SET lease_token=?,lease_expires_at=?,updated_at=? WHERE id=? AND status='preparing' AND lease_expires_at<=? RETURNING *`,
    )
      .bind(
        lease,
        new Date(Date.now() + 60000).toISOString(),
        time,
        operationId,
        time,
      )
      .first<DepositOperation>();
    if (!operation) return;
    // A job resumes from authoritative session evidence, never a serialized token.
    const session = await this.env.DB.prepare(
      `SELECT ps.*,u.email,EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.user_id=ps.user_id AND ai.issuer=ps.identity_issuer AND ai.subject=ps.identity_subject) identity_verified FROM personal_sessions ps JOIN users u ON u.id=ps.user_id WHERE ps.token_hash=? AND ps.user_id=? AND ps.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ${sensitiveSessionPolicy(this.env)} AND ${documentSessionTimeSql("ps", documentAccessMode(this.env.SENSITIVE_DOCUMENT_AUTHENTICATION), 300)} AND ps.verified_email=u.email`,
    )
      .bind(operation.auth_session_hash, operation.user_id)
      .first<{
        token_hash: string;
        user_id: string;
        email: string;
        authenticated_at: number;
        verified_email: string;
        is_development: number;
        identity_verified: number;
        mfa: number;
        verified_account: number;
        amr_json: string;
        acr: string | null;
        strong_authentication: number;
        authentication_policy_version: string | null;
      }>();
    if (!session) {
      await this.env.DB.prepare(
        "UPDATE secure_deposit_operations SET lease_expires_at=? WHERE id=? AND lease_token=?",
      )
        .bind(time, operation.id, lease)
        .run();
      return;
    }
    const principal: PersonalPrincipal = {
      userId: session.user_id,
      name: "",
      email: session.email,
      verifiedEmail: true,
      mfa: session.mfa === 1,
      verifiedAccount: session.verified_account === 1,
      identityVerified: session.identity_verified === 1,
      authenticatedAt: session.authenticated_at,
      amr: JSON.parse(session.amr_json),
      acr: session.acr,
      strongAuthentication: session.strong_authentication === 1,
      authenticationPolicyVersion: session.authentication_policy_version,
      preferredLocale: null,
      preferredDashboardAppearance: "classic",
      csrfToken: "",
      tokenHash: session.token_hash,
      simulation: this.env.MODE === "simulation",
      development: Boolean(session.is_development),
    };
    const row = await this.env.DB.prepare(
      "SELECT * FROM secure_distributions WHERE organization_id=? AND id=? AND recipient_user_id=? AND bound_at IS NOT NULL AND status='active' AND expires_at>?",
    )
      .bind(
        operation.organization_id,
        operation.distribution_id,
        operation.user_id,
        time,
      )
      .first<SecureDistributionRow>();
    if (
      !row ||
      !(JSON.parse(row.policy_json) as SecureDistributionPolicy)
        .allowVaultDeposit
    ) {
      await this.env.DB.prepare(
        "UPDATE secure_deposit_operations SET status='aborted',updated_at=? WHERE id=? AND lease_token=?",
      )
        .bind(time, operation.id, lease)
        .run();
      return;
    }
    const id = row.id,
      policy: SecureDistributionPolicy = JSON.parse(row.policy_json);
    const targetId = operation.personal_document_id,
      prefix = `secure/personal/${principal.userId}/${targetId}`;
    if (!operation.original_ready) {
      const original = await getSecureObject(
        this.env,
        row.original_key!,
        secureSharedBinding(row, "original"),
        row.source_sha256,
      );
      await putSecureObject(
        this.env,
        `${prefix}/original.bin`,
        personalBinding(principal.userId, targetId, "original"),
        original.bytes,
        "application/pdf",
      );
      await this.env.DB.prepare(
        "UPDATE secure_deposit_operations SET original_ready=1 WHERE id=? AND lease_token=?",
      )
        .bind(operation.id, lease)
        .run();
    }
    const pages = await this.env.DB.prepare(
      "SELECT * FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? AND page_number>=? ORDER BY page_number LIMIT 3",
    )
      .bind(row.organization_id, id, operation.next_page)
      .all<SecurePageRow>();
    for (const page of pages.results) {
      const image = await getSecureObject(
        this.env,
        page.image_key,
        secureSharedBinding(row, `page:${page.page_number}:image`),
        page.image_sha256,
      );
      const text = await getSecureObject(
        this.env,
        page.text_key,
        secureSharedBinding(row, `page:${page.page_number}:text`),
        page.text_sha256,
      );
      const imageKey = `${prefix}/${page.page_number}.image`,
        textKey = `${prefix}/${page.page_number}.text`;
      await Promise.all([
        putSecureObject(
          this.env,
          imageKey,
          personalBinding(
            principal.userId,
            targetId,
            `page:${page.page_number}:image`,
          ),
          image.bytes,
          "image/jpeg",
        ),
        putSecureObject(
          this.env,
          textKey,
          personalBinding(
            principal.userId,
            targetId,
            `page:${page.page_number}:text`,
          ),
          text.bytes,
          "text/plain;charset=utf-8",
        ),
      ]);
    }
    const nextPage =
      (pages.results.at(-1)?.page_number ?? operation.next_page - 1) + 1;
    if (nextPage <= row.source_pages) {
      await this.env.DB.prepare(
        "UPDATE secure_deposit_operations SET next_page=?,lease_expires_at=?,updated_at=? WHERE id=? AND lease_token=?",
      )
        .bind(nextPage, now(), now(), operation.id, lease)
        .run();
      await this.env.DISPATCH_QUEUE.send({
        dispatchId: `secure_deposit:${operation.id}`,
      });
      return;
    }
    const allPages = await this.env.DB.prepare(
      "SELECT * FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? ORDER BY page_number",
    )
      .bind(row.organization_id, id)
      .all<SecurePageRow>();
    if (allPages.results.length !== row.source_pages) throw unavailable();
    const personalPages = allPages.results.map((page) => ({
      ...page,
      image_key: `${prefix}/${page.page_number}.image`,
      text_key: `${prefix}/${page.page_number}.text`,
    }));
    const sender = await this.env.DB.prepare(
      "SELECT name FROM organizations WHERE id=?",
    )
      .bind(row.organization_id)
      .first<{ name: string }>();
    const expiresAt = new Date(
        Date.now() + policy.personalRetentionDays * 86400000,
      ).toISOString(),
      fence = sessionFence(principal, 300, this.env);
    const manifest = await secureSha256(
      canonicalJson(
        personalPages.map((page) => ({
          number: page.page_number,
          image: page.image_sha256,
          text: page.text_sha256,
        })),
      ),
    );
    const statements = [
      this.env.DB.prepare(
        `INSERT INTO secure_personal_documents(id,user_id,source_organization_id,source_distribution_id,source_sha256,source_name,sender_name,policy_json,original_key,manifest_sha256,status,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,'active',?,? WHERE EXISTS(SELECT 1 FROM secure_distributions s JOIN secure_distribution_charges c ON c.organization_id=s.organization_id AND c.distribution_id=s.id JOIN secure_deposit_operations op ON op.organization_id=s.organization_id AND op.distribution_id=s.id AND op.user_id=s.recipient_user_id
      WHERE s.organization_id=? AND s.id=? AND s.recipient_user_id=? AND s.bound_at IS NOT NULL AND s.status='active' AND s.expires_at>? AND json_extract(s.policy_json,'$.allowVaultDeposit')=1 AND op.status='preparing' AND op.lease_token=? AND op.auth_session_hash=?) AND ${fence.condition}
      ON CONFLICT(user_id,source_organization_id,source_distribution_id) DO NOTHING RETURNING id`,
      ).bind(
        targetId,
        principal.userId,
        row.organization_id,
        id,
        row.source_sha256,
        row.source_name,
        sender?.name ?? "Guteneo workspace",
        row.policy_json,
        `${prefix}/original.bin`,
        manifest,
        time,
        expiresAt,
        row.organization_id,
        id,
        principal.userId,
        now(),
        lease,
        principal.tokenHash,
        ...fence.values,
      ),
    ];
    for (const page of personalPages)
      statements.push(
        this.env.DB.prepare(
          `INSERT INTO secure_personal_pages(user_id,personal_document_id,page_number,image_key,image_sha256,text_key,text_sha256,width,height)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=? AND status='active') ON CONFLICT(user_id,personal_document_id,page_number) DO NOTHING`,
        ).bind(
          principal.userId,
          targetId,
          page.page_number,
          page.image_key,
          page.image_sha256,
          page.text_key,
          page.text_sha256,
          page.width,
          page.height,
          principal.userId,
          targetId,
        ),
      );
    statements.push(
      this.env.DB.prepare(
        "UPDATE secure_deposit_operations SET status='active',updated_at=? WHERE id=? AND lease_token=? AND EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=?)",
      ).bind(now(), operation.id, lease, principal.userId, targetId),
    );
    statements.push(
      this.env.DB.prepare(
        `INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,user_id,type,provenance,created_at) SELECT ?,?,?,?,'personal_copy_delivered','server',? WHERE EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=?)`,
      ).bind(
        `deposit_shared_${operation.id}`,
        row.organization_id,
        id,
        principal.userId,
        now(),
        principal.userId,
        targetId,
      ),
    );
    statements.push(
      this.env.DB.prepare(
        `INSERT OR IGNORE INTO secure_document_events(id,personal_document_id,user_id,type,provenance,created_at) SELECT ?,?,?,'personal_copy_received','server',? WHERE EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=?)`,
      ).bind(
        `deposit_personal_${operation.id}`,
        targetId,
        principal.userId,
        now(),
        principal.userId,
        targetId,
      ),
    );
    const results = await this.env.DB.batch(statements);
    if (!results[0].results.length) {
      const raced = await this.env.DB.prepare(
        "SELECT id,expires_at FROM secure_personal_documents WHERE user_id=? AND source_organization_id=? AND source_distribution_id=?",
      )
        .bind(principal.userId, row.organization_id, id)
        .first<{ id: string; expires_at: string }>();
      if (raced)
        return { id: raced.id, status: "active", expiresAt: raced.expires_at };
      // A lost session pauses a paid copy; only loss of the shared grant makes
      // it terminal. Drop the credential so a cron job cannot resume this copy
      // until an explicit POST supplies a newly authenticated session that meets the configured policy.
      const pending = await this.env.DB.prepare(
        `UPDATE secure_deposit_operations SET
        status=CASE WHEN EXISTS(SELECT 1 FROM secure_distributions s JOIN secure_distribution_charges c ON c.organization_id=s.organization_id AND c.distribution_id=s.id
          WHERE s.organization_id=secure_deposit_operations.organization_id AND s.id=secure_deposit_operations.distribution_id
          AND s.recipient_user_id=secure_deposit_operations.user_id AND s.bound_at IS NOT NULL AND s.status='active'
          AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND json_extract(s.policy_json,'$.allowVaultDeposit')=1)
          THEN 'preparing' ELSE 'aborted' END,
        auth_session_hash=NULL,lease_token='',lease_expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=? AND lease_token=? AND status='preparing' RETURNING status`,
      )
        .bind(operation.id, lease)
        .first<{ status: string }>();
      if (pending?.status === "preparing")
        throw new DomainError(
          this.env.SENSITIVE_DOCUMENT_AUTHENTICATION === "verified_account"
            ? "DOCUMENT_AUTHENTICATION_REQUIRED"
            : "STRONG_AUTHENTICATION_REQUIRED",
          "Sign in again to complete your personal copy.",
          403,
        );
      throw unavailable();
    }
    return { id: targetId, status: "active", expiresAt };
  }
  async recoverPending() {
    const rows = await this.env.DB.prepare(
      `SELECT op.id FROM secure_deposit_operations op JOIN personal_sessions ps ON ps.token_hash=op.auth_session_hash AND ps.user_id=op.user_id JOIN secure_distributions s ON s.organization_id=op.organization_id AND s.id=op.distribution_id
      WHERE op.status='preparing' AND op.lease_expires_at<? AND s.status='active' AND s.expires_at>? AND ps.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ${sensitiveSessionPolicy(this.env)} AND ${documentSessionTimeSql("ps", documentAccessMode(this.env.SENSITIVE_DOCUMENT_AUTHENTICATION), 300)} ORDER BY op.created_at LIMIT 10`,
    )
      .bind(now(), now())
      .all<{ id: string }>();
    for (const row of rows.results)
      await this.env.DISPATCH_QUEUE.send({
        dispatchId: `secure_deposit:${row.id}`,
      });
    await this.env.DB.prepare(
      "UPDATE secure_deposit_operations SET status='aborted',updated_at=? WHERE id IN (SELECT op.id FROM secure_deposit_operations op JOIN secure_distributions s ON s.organization_id=op.organization_id AND s.id=op.distribution_id WHERE op.status='preparing' AND (s.status<>'active' OR s.expires_at<?) LIMIT 100)",
    )
      .bind(now(), now())
      .run();
  }
  async remove(principal: PersonalPrincipal, id: string) {
    await this.rate(principal);
    requirePersonalDocumentAuthentication(principal, this.env, {
      maxAgeSeconds: 300,
    });
    const row = await this.personal(principal, id),
      fence = sessionFence(principal, 300, this.env);
    const results = await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE secure_personal_documents SET status='deleted' WHERE user_id=? AND id=? AND status='active' AND ${fence.condition} RETURNING id`,
      ).bind(principal.userId, id, ...fence.values),
      this.env.DB.prepare(
        `INSERT OR IGNORE INTO secure_document_events(id,personal_document_id,user_id,session_hash,type,provenance,created_at) SELECT ?,?,?,?,'personal_copy_deleted','server',? WHERE EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=? AND status='deleted') AND ${fence.condition}`,
      ).bind(
        `personal_deleted_${row.id}`,
        row.id,
        principal.userId,
        principal.tokenHash,
        now(),
        principal.userId,
        row.id,
        ...fence.values,
      ),
    ]);
    if (!results[0].results.length) throw unavailable();
    return { deleted: true };
  }
}
