import { APPLICATION_TIME_ZONE } from "./application-time";
import { Channels } from "./belvedere-summary-components";
import type { BelvedereFinance } from "../../../packages/contracts/src/belvedere";
import {
  dateTime,
  money,
  number,
  queryString,
  useBelvedereResource,
} from "./belvedere-data";
import { bmsg, bmsgIn, belvedereNetResultReason } from "./belvedere-i18n";
import { formatLocale } from "./locale";
import { DataTable } from "./data-table";
import {
  type ViewProps,
  Notice,
  Failure,
  Loading,
  Empty,
  SectionHeading,
} from "./belvedere-view-components";

export function Finance({ basePath, filters, revision, refresh }: ViewProps) {
  const { data, error } = useBelvedereResource<BelvedereFinance>(
    `${basePath}/api/finance?${queryString(filters)}`,
    revision,
  );
  if (error)
    return <Failure error={error} retry={refresh} basePath={basePath} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="bv-finance-summary">
        <section>
          <span className="bv-finance-label">
            {bmsg("Customer consumption recorded in the ledger")}
          </span>
          <strong>{money(data.customerConsumptionMinor)}</strong>
          <p>
            {filters.mode === "production"
              ? bmsg(
                  "Dispatch, hosting, PDF check and legacy plan debits recorded in this period, by ledger date, including dispatches deleted since. These amounts may come from promotional credits.",
                )
              : bmsg(
                  "Simulated dispatch, PDF check and legacy plan consumption by confirmation or ledger date. These are not real receipts.",
                )}
          </p>
          <span className="bv-finance-reserved">
            {money(data.reservedMinor)}
            {bmsg(" currently reserved for dispatches created in this period")}
          </span>
        </section>
        <section>
          <span className="bv-finance-label">{bmsg("Verified receipts")}</span>
          <div className="bv-finance-cash">
            {data.cashStatus === "unconfigured" ? (
              <strong
                className="bv-unavailable"
                title={bmsgIn("belvedere-plural", "Not configured")}
              >
                <span aria-hidden="true">—</span>
                <span className="sr-only">
                  {bmsgIn("belvedere-plural", "Not configured")}
                </span>
              </strong>
            ) : data.cashReceived.length ? (
              data.cashReceived.map((item) => (
                <strong key={item.currency}>
                  {money(item.amountMinor, item.currency)}
                </strong>
              ))
            ) : (
              <strong>{money(0)}</strong>
            )}
          </div>
          <p>
            {data.cashStatus === "unconfigured"
              ? bmsg(
                  "Verified Stripe payments are not available yet. No revenue is inferred from consumption.",
                )
              : bmsg(
                  "Verified Stripe payments by creation date recorded by Stripe, grouped by currency. This date does not prove bank receipt; promotional credits are excluded.",
                )}
          </p>
        </section>
      </div>
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Provider costs")}>
            {bmsg("Provider reconciliations recorded in this period")}
          </SectionHeading>
          <div className="bv-supplier-totals">
            {data.supplierVerified.length ? (
              data.supplierVerified.map((item) => (
                <div key={item.currency}>
                  <span>{item.currency}</span>
                  <strong>{money(item.amountMinor, item.currency)}</strong>
                </div>
              ))
            ) : (
              <p className="bv-subtle">
                {bmsg("No verified provider costs in this period.")}
              </p>
            )}
          </div>
          <Notice
            tone={data.supplierUnverifiedDispatches > 0 ? "warning" : "neutral"}
          >
            {data.supplierUnverifiedDispatches === 1
              ? bmsg(
                  "1 dispatch created in this period has no verified provider cost. A missing value does not mean zero cost.",
                )
              : bmsg(
                  "{0} dispatches created in this period have no verified provider costs. A missing value does not mean zero cost.",
                  number(data.supplierUnverifiedDispatches),
                )}
          </Notice>
        </section>
        <section className="bv-panel bv-result">
          <SectionHeading title={bmsg("Net profit")} />
          <strong>{bmsg("Cannot be calculated")}</strong>
          <p>{belvedereNetResultReason(data.netResultUnavailableReason)}</p>
          <span className="bv-source-note">
            {bmsg(
              "Receipts, consumption and known costs alone do not establish an accounting result.",
            )}
          </span>
        </section>
      </div>
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Consumption by channel")}>
            {bmsg(
              "Volumes: dispatches created in this period. Amounts: debits recorded in the period, excluding legacy plan charges.",
            )}
          </SectionHeading>
          <Channels channels={data.channels} />
          <dl className="bv-finance-lines">
            <div>
              <dt>{bmsg("Legacy PDF plans")}</dt>
              <dd>{money(data.legacyPlanConsumptionMinor)}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {data.legacyPlanCharges === 1
              ? bmsg(
                  "1 subscription debit recorded in this period, included in total consumption. It is not counted as a dispatch.",
                )
              : bmsg(
                  "{0} subscription debits recorded in this period, included in total consumption. They are not counted as dispatches.",
                  number(data.legacyPlanCharges),
                )}
          </p>
        </section>
        <section className="bv-panel">
          <SectionHeading title={bmsg("Promotional credits")}>
            {bmsg("Current state of granted credits")}
          </SectionHeading>
          <dl className="bv-finance-lines">
            <div>
              <dt>{bmsg("Total granted")}</dt>
              <dd>{money(data.promotionalGrantedMinor)}</dd>
            </div>
            <div>
              <dt>{bmsg("Remaining balance")}</dt>
              <dd>{money(data.promotionalRemainingMinor)}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {bmsg(
              "Promotional credits provide access to the service; they are not receipts.",
            )}
          </p>
        </section>
      </div>
      <section className="bv-panel bv-table-panel">
        <SectionHeading title={bmsg("Monthly summary")}>
          {filters.mode === "production"
            ? bmsg(
                "Debits by ledger month, including PDF checks, legacy plans and the history of deleted dispatches.",
              )
            : bmsg(
                "Simulated consumption by confirmation or ledger month.",
              )}{" "}
          {bmsg("Months at either end of the period may be incomplete.")}
        </SectionHeading>
        {data.monthly.length ? (
          <DataTable
            viewId="platform-monthly-consumption"
            label={bmsg("Monthly consumption")}
            className="bv-data-table"
            items={data.monthly}
            getRowKey={(month) => month.month}
            columns={[
              {
                id: "month",
                label: bmsg("Month"),
                value: (month) => month.month,
                searchValue: (month) =>
                  new Intl.DateTimeFormat(formatLocale(), {
                    month: "long",
                    year: "numeric",
                    timeZone: APPLICATION_TIME_ZONE,
                  }).format(
                    new Date(`${month.month.slice(0, 7)}-01T12:00:00Z`),
                  ),
                render: (month) => (
                  <>
                    {new Intl.DateTimeFormat(formatLocale(), {
                      month: "long",
                      year: "numeric",
                      timeZone: APPLICATION_TIME_ZONE,
                    }).format(
                      new Date(`${month.month.slice(0, 7)}-01T12:00:00Z`),
                    )}
                  </>
                ),
              },
              {
                id: "dispatches",
                label: bmsg("Debited dispatches"),
                value: (month) => month.dispatches,
                searchValue: (month) => number(month.dispatches),
                className: "bv-numeric",
                render: (month) => <>{number(month.dispatches)}</>,
              },
              {
                id: "dispatchConsumption",
                label: bmsg("Dispatches and hosting"),
                value: (month) =>
                  month.consumptionMinor - month.legacyPlanConsumptionMinor,
                searchValue: (month) =>
                  money(
                    month.consumptionMinor - month.legacyPlanConsumptionMinor,
                  ),
                className: "bv-numeric",
                render: (month) => (
                  <>
                    {money(
                      month.consumptionMinor - month.legacyPlanConsumptionMinor,
                    )}
                  </>
                ),
              },
              {
                id: "legacyPlans",
                label: bmsg("Legacy PDF plans"),
                value: (month) => month.legacyPlanConsumptionMinor,
                searchValue: (month) => money(month.legacyPlanConsumptionMinor),
                className: "bv-numeric",
                render: (month) => (
                  <>{money(month.legacyPlanConsumptionMinor)}</>
                ),
              },
              {
                id: "consumption",
                label: bmsg("Total consumption"),
                value: (month) => month.consumptionMinor,
                searchValue: (month) => money(month.consumptionMinor),
                className: "bv-numeric bv-emphasis",
                render: (month) => <>{money(month.consumptionMinor)}</>,
              },
            ]}
          />
        ) : (
          <Empty title={bmsg("No consumption recorded in the ledger.")}>
            {bmsg(
              "The summary will appear when workshops consume their credits.",
            )}
          </Empty>
        )}
      </section>
      <p className="bv-freshness">
        {bmsg("Calculated on ")}
        {dateTime(data.generatedAt)}
        {bmsg(" · Quotes and limits remain available in workshop details.")}
      </p>
    </>
  );
}
