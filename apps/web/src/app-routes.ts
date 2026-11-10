/**
 * Application routes in one place: the space a page belongs to, the navigation
 * entry it highlights, the Studio addresses and aliases for earlier links.
 * Routes are hash paths such as `/app/studio/templates?new=blank`.
 */
export type ApplicationSpace =
  "workshop" | "studio" | "personal" | "administration";

export type WorkshopEntry =
  | "overview"
  | "dispatches"
  | "campaigns"
  | "secure-distributions"
  | "documents"
  | "pdfChecks"
  | "senders"
  | "recipients"
  | "schedules"
  | "connection";

/** Workspace administration: reports, members, billing and settings. */
export type AdministrationEntry =
  | "administrationOverview"
  | "administrationActivity"
  | "administrationConsumption"
  | "administrationReports"
  | "administrationMembers"
  | "administrationConnections"
  | "administrationWebhooks"
  | "administrationAudit"
  | "administrationBilling"
  | "administrationSettings";

export const administrationRoutes = {
  home: "/app/administration",
  activity: "/app/administration/activity",
  consumption: "/app/administration/consumption",
  reports: "/app/administration/reports",
  members: "/app/administration/members",
  connections: "/app/administration/connections",
  webhooks: "/app/administration/webhooks",
  audit: "/app/administration/audit",
  billing: "/app/administration/billing",
  settings: "/app/administration/settings",
} as const;

export type StudioEntry = "templates" | "datasets" | "generations";

/** Studio creates; dispatch preparation and tracking stay in the workshop. */
export const studioRoutes = {
  home: "/app/studio/templates",
  templates: "/app/studio/templates",
  template: (id: string) => `/app/studio/template/${id}`,
  datasets: "/app/studio/datasets",
  dataset: (id: string) => `/app/studio/dataset/${id}`,
  generations: "/app/studio/generations",
  generation: (id: string) => `/app/studio/generation/${id}`,
} as const;

/** Selection is navigation context only; arrival rechecks every private record. */
export function readGenerationSelection(route: string): {
  recordIds: string[];
  valid: boolean;
} {
  const values = new URLSearchParams(route.split("?")[1]).getAll("selected");
  const valid =
    values.length <= 500 &&
    values.every((value) => value.length > 0 && value.length <= 200);
  return { recordIds: valid ? [...new Set(values)] : [], valid };
}
function selectedGenerationQuery(jobId: string, recordIds: string[]) {
  const query = new URLSearchParams({ generation: jobId });
  for (const recordId of recordIds) query.append("selected", recordId);
  return query;
}
export function distributionPreparationRoute(
  jobId: string,
  recordIds: string[],
) {
  return `/app/distribution/new?${selectedGenerationQuery(jobId, recordIds)}`;
}
export function generationSelectionRoute(jobId: string, recordIds: string[]) {
  const query = selectedGenerationQuery(jobId, recordIds);
  query.delete("generation");
  return studioRoutes.generation(jobId) + (query.size ? "?" + query : "");
}

/** The first page of each space. */
export const spaceHome: Record<ApplicationSpace, string> = {
  workshop: "/app",
  studio: studioRoutes.home,
  personal: "/app/my-documents",
  administration: administrationRoutes.home,
};

const personalPage = /^\/app\/(my-documents|services|personal-account)(\/|$)/;
const studioPage = /^\/app\/studio(\/|$)/;
const administrationPage = /^\/app\/administration(\/|$)/;

// Earlier application links keep working; the query is retained.
const studioAliases: [RegExp, string][] = [
  [/^\/app\/templates(?=$|\?)/, studioRoutes.templates],
  [/^\/app\/template\//, "/app/studio/template/"],
  [/^\/app\/datasets(?=$|\?)/, studioRoutes.datasets],
  [/^\/app\/dataset\//, "/app/studio/dataset/"],
  [/^\/app\/generations(?=$|\?)/, studioRoutes.generations],
  [/^\/app\/generation\//, "/app/studio/generation/"],
  [/^\/app\/studio\/?(?=$|\?)/, studioRoutes.home],
  // Workspace management moved from Correspondence and the profile to
  // Administration; earlier links, including billing returns, keep working.
  [/^\/app\/admin(?=$|\?)/, administrationRoutes.members],
  [/^\/app\/billing(?=$|\?)/, administrationRoutes.billing],
  [/^\/app\/usage(?=$|\?)/, administrationRoutes.consumption],
];

/** The canonical route for an earlier or shortened application address. */
export function canonicalApplicationRoute(route: string): string {
  for (const [alias, canonical] of studioAliases)
    if (alias.test(route)) return route.replace(alias, canonical);
  return route;
}

function pathOf(route: string) {
  return route.split("?")[0] ?? "";
}

export function spaceOf(route: string): ApplicationSpace {
  const path = pathOf(route);
  if (personalPage.test(path)) return "personal";
  if (administrationPage.test(path)) return "administration";
  if (studioPage.test(path)) return "studio";
  return "workshop";
}

/** The navigation entry a page belongs to, for `aria-current`. */
export function navigationEntryFor(
  route: string,
): WorkshopEntry | StudioEntry | AdministrationEntry | undefined {
  const path = pathOf(route);
  const administration = (
    Object.entries(administrationRoutes) as [
      keyof typeof administrationRoutes,
      string,
    ][]
  ).find(([, entry]) => entry === path);
  if (administration)
    return administration[0] === "home"
      ? "administrationOverview"
      : (`administration${administration[0][0].toUpperCase()}${administration[0].slice(1)}` as AdministrationEntry);
  if (path === "/app") return "overview";
  if (
    /^\/app\/(dispatches|prepare)$/.test(path) ||
    /^\/app\/(dispatch|postal|distribution)\//.test(path)
  )
    return "dispatches";
  if (path === "/app/campaigns" || path.startsWith("/app/campaign/"))
    return "campaigns";
  if (/^\/app\/secure-distributions?(\/|$)/.test(path))
    return "secure-distributions";
  if (path === "/app/documents") return "documents";
  if (path === "/app/pdf-checks" || path === "/app/plan") return "pdfChecks";
  if (path === "/app/senders") return "senders";
  if (/^\/app\/recipients(\/|$)/.test(path)) return "recipients";
  if (/^\/app\/schedules(\/|$)/.test(path)) return "schedules";
  if (/^\/app\/connection(\/|$)/.test(path)) return "connection";
  // Correcting a generation's data stays in Generations, where it started.
  if (
    /^\/app\/studio\/template\//.test(path) &&
    new URLSearchParams(route.split("?")[1]).has("generation")
  )
    return "generations";
  if (/^\/app\/studio\/templates?(\/|$)/.test(path)) return "templates";
  if (/^\/app\/studio\/datasets?(\/|$)/.test(path)) return "datasets";
  if (/^\/app\/studio\/generations?(\/|$)/.test(path)) return "generations";
  return undefined;
}
