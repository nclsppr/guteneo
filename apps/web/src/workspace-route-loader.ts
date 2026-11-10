function routeModule<T>(load: () => Promise<T>) {
  let request: Promise<T> | undefined;
  return () =>
    (request ??= load().catch((error: unknown) => {
      request = undefined;
      throw error;
    }));
}

// Imports contain UI code only. Components retain their authenticated reads.
export const workspaceRouteModules = {
  personal: routeModule(() => import("./personal-area")),
  dispatch: routeModule(() => import("./dispatch-pages")),
  overview: routeModule(() => import("./overview-page")),
  documents: routeModule(() => import("./documents-page")),
  prepare: routeModule(() => import("./prepare-dispatch-page")),
  dispatchList: routeModule(() => import("./dispatch-list-page")),
  dispatchDetail: routeModule(() => import("./dispatch-detail-page")),
  workspace: routeModule(() => import("./workspace-pages")),
  postal: routeModule(() => import("./postal-review-page")),
  account: routeModule(() => import("./account-page")),
  administration: routeModule(() => import("./administration")),
  recipients: routeModule(() => import("./recipient-pages")),
  schedules: routeModule(() => import("./schedule-pages")),
  connection: routeModule(() => import("./assistant-workspace")),
  studio: routeModule(() => import("./document-studio")),
  distribution: routeModule(() => import("./distribution-pages")),
  secureDistribution: routeModule(() => import("./secure-distribution-pages")),
};

/** Start only the requested route's code, independently of its session read. */
export async function preloadWorkspaceRoute(route: string): Promise<void> {
  const path = route.split("?")[0] ?? "";
  if (path === "/app") await workspaceRouteModules.overview();
  else if (/^\/app\/documents(\/|$)/.test(path))
    await workspaceRouteModules.documents();
  else if (/^\/app\/prepare(\/|$)/.test(path))
    await workspaceRouteModules.prepare();
  else if (/^\/app\/dispatches(\/|$)/.test(path))
    await workspaceRouteModules.dispatchList();
  else if (/^\/app\/dispatch(\/|$)/.test(path))
    await workspaceRouteModules.dispatchDetail();
  else if (/^\/app\/recipients(\/|$)/.test(path))
    await workspaceRouteModules.recipients();
  else if (/^\/app\/schedules(\/|$)/.test(path))
    await workspaceRouteModules.schedules();
  else if (/^\/app\/(campaigns|campaign|senders)(\/|$)/.test(path))
    await workspaceRouteModules.workspace();
  // Earlier management addresses are aliases of Administration.
  else if (/^\/app\/(administration|admin|billing|usage)(\/|$|\?)/.test(path))
    await workspaceRouteModules.administration();
  else if (path === "/app/account") await workspaceRouteModules.account();
  else if (path.startsWith("/app/postal/"))
    await workspaceRouteModules.postal();
  else if (/^\/app\/connection(\/|$)/.test(path))
    await workspaceRouteModules.connection();
  else if (/^\/app\/distribution(\/|$)/.test(path))
    await workspaceRouteModules.distribution();
  else if (/^\/app\/studio(\/|$)/.test(path))
    await workspaceRouteModules.studio();
  else if (/^\/app\/secure-distributions?(\/|$)/.test(path))
    await workspaceRouteModules.secureDistribution();
}
