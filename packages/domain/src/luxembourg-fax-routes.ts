/** Exact Local prefix/category deck observed 2026-09-17.
 * This is route classification, not a tariff or authority grant. Keep the static
 * SQL view luxembourg_operator_fax_routes in migration 0027 in sync.
 */
export const LUXEMBOURG_OPERATOR_FAX_ROUTES = {
  "+35222": "fixed",
  "+35223": "fixed",
  "+35224": "fixed",
  "+35225": "fixed",
  "+35226": "fixed",
  "+35227": "fixed",
  "+35228": "fixed",
  "+35229": "fixed",
  "+3523": "fixed",
  "+3524": "fixed",
  "+3525": "fixed",
  "+3527": "fixed",
  "+352802": "fixed",
  "+352803": "fixed",
  "+352804": "fixed",
  "+352805": "fixed",
  "+352806": "fixed",
  "+352807": "fixed",
  "+352808": "fixed",
  "+352809": "fixed",
  "+35281": "fixed",
  "+35283": "fixed",
  "+35284": "fixed",
  "+35285": "fixed",
  "+35286": "fixed",
  "+35287": "fixed",
  "+35288": "fixed",
  "+35289": "fixed",
  "+352908": "fixed",
  "+352909": "fixed",
  "+35292": "fixed",
  "+35293": "fixed",
  "+35294": "fixed",
  "+35295": "fixed",
  "+35297": "fixed",
  "+35299": "fixed",
  "+35220": "ngn",
  "+352291": "ngn",
  "+352801": "ngn",
  "+35260": "ngn",
  "+3526": "mobile",
  "+352800": "freephone",
} as const;

export function luxembourgOperatorRoute(number: string) {
  let match: { prefix: string; category: string } | undefined;
  for (const [prefix, category] of Object.entries(
    LUXEMBOURG_OPERATOR_FAX_ROUTES,
  )) {
    if (
      number.startsWith(prefix) &&
      (!match || prefix.length > match.prefix.length)
    ) {
      match = { prefix, category };
    }
  }
  return match;
}
