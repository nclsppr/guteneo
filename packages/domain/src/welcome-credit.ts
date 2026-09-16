export type WelcomeCredit = {
  kind: "promotional" | "simulation";
  currency: "EUR";
  grantedMinor: number;
  reservedMinor: number;
  spentMinor: number;
  availableMinor: number;
  grantedAt: string | null;
  status: "available" | "exhausted" | "not_granted" | "simulation";
  renewal: "none";
  topUpAvailable: false;
};

/** Caller must authenticate organization membership before reading its balance. */
export async function readWelcomeCredit(
  db: D1Database,
  organizationId: string,
): Promise<WelcomeCredit> {
  const row = await db
    .prepare(
      "SELECT o.mode,b.granted_minor,b.reserved_minor,b.spent_minor,b.available_minor,b.granted_at FROM organizations o LEFT JOIN welcome_credit_balances b ON b.organization_id=o.id WHERE o.id=?",
    )
    .bind(organizationId)
    .first<{
      mode: string;
      granted_minor: number | null;
      reserved_minor: number | null;
      spent_minor: number | null;
      available_minor: number | null;
      granted_at: string | null;
    }>();
  const simulation = row?.mode === "simulation";
  return {
    kind: simulation ? "simulation" : "promotional",
    currency: "EUR",
    grantedMinor: row?.granted_minor ?? 0,
    reservedMinor: row?.reserved_minor ?? 0,
    spentMinor: row?.spent_minor ?? 0,
    availableMinor: row?.available_minor ?? 0,
    grantedAt: row?.granted_at ?? null,
    status: simulation
      ? "simulation"
      : row?.granted_minor == null
        ? "not_granted"
        : row.available_minor === 0
          ? "exhausted"
          : "available",
    renewal: "none",
    topUpAvailable: false,
  };
}

/** A monthly safety ceiling is renewed, never the lifetime promotional grant.
 * Preserve the most recent operator-defined cap, including an explicit zero. */
export function ensureCreditPeriod(
  db: D1Database,
  organizationId: string,
  channel: string,
  period: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency)
SELECT ?,?,?,COALESCE((SELECT limit_count FROM usage WHERE organization_id=? AND channel=? ORDER BY period DESC LIMIT 1),10000),COALESCE((SELECT limit_minor FROM usage WHERE organization_id=? AND channel=? ORDER BY period DESC LIMIT 1),5000),'EUR'
WHERE EXISTS(SELECT 1 FROM welcome_credit_grants g JOIN organizations o ON o.id=g.organization_id WHERE g.organization_id=? AND o.mode='production')
ON CONFLICT(organization_id,channel,period) DO NOTHING`,
    )
    .bind(
      organizationId,
      channel,
      period,
      organizationId,
      channel,
      organizationId,
      channel,
      organizationId,
    );
}
