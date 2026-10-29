/**
 * Application routes in one place: the space a page belongs to, the navigation
 * entry it highlights, the Studio addresses and aliases for earlier links.
 * Routes are hash paths such as `/app/studio/templates?new=blank`.
 */
export type ApplicationSpace = "workshop" | "studio" | "personal";

export type WorkshopEntry =
  | "overview"
  | "dispatches"
  | "campaigns"
  | "secure-distributions"
  | "documents"
  | "pdfChecks"
  | "senders"
  | "connection"
  | "usage"
  | "billing"
  | "admin";

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

/** The first page of each space. */
export const spaceHome: Record<ApplicationSpace, string> = {
  workshop: "/app",
  studio: studioRoutes.home,
  personal: "/app/my-documents",
};

const personalPage = /^\/app\/(my-documents|services|personal-account)(\/|$)/;
const studioPage = /^\/app\/studio(\/|$)/;

// Earlier Studio links keep working; the query is retained.
const studioAliases: [RegExp, string][] = [
  [/^\/app\/templates(?=$|\?)/, studioRoutes.templates],
  [/^\/app\/template\//, "/app/studio/template/"],
  [/^\/app\/datasets(?=$|\?)/, studioRoutes.datasets],
  [/^\/app\/dataset\//, "/app/studio/dataset/"],
  [/^\/app\/generations(?=$|\?)/, studioRoutes.generations],
  [/^\/app\/generation\//, "/app/studio/generation/"],
  [/^\/app\/studio\/?(?=$|\?)/, studioRoutes.home],
];

/** The canonical route for an earlier or shortened Studio address. */
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
  if (studioPage.test(path)) return "studio";
  return "workshop";
}

/** The navigation entry a page belongs to, for `aria-current`. */
export function navigationEntryFor(
  route: string,
): WorkshopEntry | StudioEntry | undefined {
  const path = pathOf(route);
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
  if (/^\/app\/connection(\/|$)/.test(path)) return "connection";
  if (path === "/app/usage") return "usage";
  if (path === "/app/billing") return "billing";
  if (/^\/app\/admin(\/|$)/.test(path)) return "admin";
  if (/^\/app\/studio\/templates?(\/|$)/.test(path)) return "templates";
  if (/^\/app\/studio\/datasets?(\/|$)/.test(path)) return "datasets";
  if (/^\/app\/studio\/generations?(\/|$)/.test(path)) return "generations";
  return undefined;
}
