import type {
  UsageActivity,
  UsageActivityDay,
} from "../../contracts/src/usage-activity";

/** The caller must check current organization membership and reporting rights. */
export async function readUsageActivity(
  db: D1Database,
  organizationId: string,
  evidence: "production" | "simulation",
  year: number,
  asOf: string,
): Promise<UsageActivity> {
  // Services debit independently of delivery settlement. Never add the nanoEUR
  // precision ledger again: its incremental debit is already in spent_delta.
  const sources: {
    table: string;
    date: string;
    amount: string;
    dispatch: number;
    filter: string;
    organization?: string;
  }[] =
    evidence === "production"
      ? [
          {
            table: "welcome_credit_entries",
            date: "created_at",
            amount: "spent_delta",
            dispatch: 1,
            filter: "kind='settled'",
          },
          {
            table: "protected_hosting_charges",
            date: "created_at",
            amount: "amount_minor",
            dispatch: 0,
            filter: "1=1",
          },
          {
            table: "horizon_plan_charges",
            date: "created_at",
            amount: "amount_minor",
            dispatch: 0,
            filter: "evidence='production'",
          },
          {
            table: "secure_distribution_charges",
            date: "created_at",
            amount: "amount_minor",
            dispatch: 0,
            filter: "evidence='production'",
          },
          {
            table:
              "pdf_validation_purchases p JOIN pdf_validations v ON v.organization_id=p.organization_id AND v.id=p.validation_id",
            date: "v.completed_at",
            amount: "p.amount_minor",
            dispatch: 0,
            filter: "p.evidence='production' AND v.status='complete'",
            organization: "p.organization_id",
          },
        ]
      : [
          {
            table: "reservations",
            date: "updated_at",
            amount: "amount_minor",
            dispatch: 1,
            filter: "status='confirmed'",
          },
          {
            table: "horizon_plan_charges",
            date: "created_at",
            amount: "amount_minor",
            dispatch: 0,
            filter: "evidence='simulation'",
          },
          {
            table: "secure_distribution_charges",
            date: "created_at",
            amount: "amount_minor",
            dispatch: 0,
            filter: "evidence='simulation'",
          },
          {
            table:
              "pdf_validation_purchases p JOIN pdf_validations v ON v.organization_id=p.organization_id AND v.id=p.validation_id",
            date: "v.completed_at",
            amount: "p.amount_minor",
            dispatch: 0,
            filter: "p.evidence='simulation' AND v.status='complete'",
            organization: "p.organization_id",
          },
        ];
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;
  const dailyLedger = sources
    .map(
      (source) =>
        `SELECT ${source.date} posted_at,${source.amount} amount_minor,${source.dispatch} dispatch_count FROM ${source.table} WHERE ${source.organization ?? "organization_id"}=? AND ${source.filter} AND ${source.date}>=? AND ${source.date}<? AND ${source.date}<=?`,
    )
    .join(" UNION ALL ");
  const yearLedger = sources
    .map(
      (source) =>
        `SELECT substr(${source.date},1,4) year FROM ${source.table} WHERE ${source.organization ?? "organization_id"}=? AND ${source.filter} AND ${source.date}<=?`,
    )
    .join(" UNION ALL ");
  const [daily, years] = await db.batch([
    db
      .prepare(
        `WITH charges AS (${dailyLedger}) SELECT substr(posted_at,1,10) date,sum(amount_minor) amountMinor,sum(dispatch_count) dispatchCount,count(*) chargeCount FROM charges GROUP BY substr(posted_at,1,10) ORDER BY date`,
      )
      .bind(...sources.flatMap(() => [organizationId, start, end, asOf])),
    db
      .prepare(`SELECT DISTINCT year FROM (${yearLedger}) ORDER BY year DESC`)
      .bind(...sources.flatMap(() => [organizationId, asOf])),
  ]);
  const days = daily.results as UsageActivityDay[];
  const postedYears = years.results as { year: string }[];
  const currentYear = Number(asOf.slice(0, 4));
  const availableYears = [
    ...new Set([currentYear, ...postedYears.map((row) => Number(row.year))]),
  ].sort((a, b) => b - a);
  return {
    year,
    currentYear,
    availableYears,
    asOf,
    timeZone: "UTC",
    currency: "EUR",
    evidence,
    days,
    totals: days.reduce(
      (total, day) => ({
        amountMinor: total.amountMinor + day.amountMinor,
        dispatchCount: total.dispatchCount + day.dispatchCount,
        chargeCount: total.chargeCount + day.chargeCount,
        activeDays: total.activeDays + 1,
      }),
      { amountMinor: 0, dispatchCount: 0, chargeCount: 0, activeDays: 0 },
    ),
  };
}
