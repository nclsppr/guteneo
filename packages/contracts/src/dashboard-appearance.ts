/** Personal web presentation only; never changes dispatch or approval data. */
export const dashboardAppearances = ["classic", "v2"] as const;
export type DashboardAppearance = (typeof dashboardAppearances)[number];
export const defaultDashboardAppearance: DashboardAppearance = "classic";

export function isDashboardAppearance(
  value: unknown,
): value is DashboardAppearance {
  return value === "classic" || value === "v2";
}
