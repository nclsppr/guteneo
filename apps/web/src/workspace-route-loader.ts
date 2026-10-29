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
  dispatch: routeModule(() => import("./dispatch-pages")),
  workspace: routeModule(() => import("./workspace-pages")),
  billing: routeModule(() => import("./billing-page")),
  postal: routeModule(() => import("./postal-review-page")),
  account: routeModule(() => import("./account-page")),
  invitations: routeModule(() => import("./team-invitations")),
  connection: routeModule(() => import("./assistant-workspace")),
  studio: routeModule(() => import("./document-studio")),
  secureDistribution: routeModule(() => import("./secure-distribution-pages")),
};

/** Start only the requested route's code, independently of its session read. */
export async function preloadWorkspaceRoute(route: string): Promise<void> {
  const path = route.split("?")[0] ?? "";
  if (
    path === "/app" ||
    /^\/app\/(documents|prepare|dispatches|dispatch)(\/|$)/.test(path)
  )
    await workspaceRouteModules.dispatch();
  else if (/^\/app\/(campaigns|campaign|senders|usage)(\/|$)/.test(path))
    await workspaceRouteModules.workspace();
  else if (path === "/app/admin")
    await Promise.all([
      workspaceRouteModules.workspace(),
      workspaceRouteModules.account(),
      workspaceRouteModules.invitations(),
    ]);
  else if (path === "/app/account") await workspaceRouteModules.account();
  else if (path === "/app/billing") await workspaceRouteModules.billing();
  else if (path.startsWith("/app/postal/"))
    await workspaceRouteModules.postal();
  else if (/^\/app\/connection(\/|$)/.test(path))
    await workspaceRouteModules.connection();
  else if (/^\/app\/(studio|distribution)(\/|$)/.test(path))
    await workspaceRouteModules.studio();
  else if (/^\/app\/secure-distributions?(\/|$)/.test(path))
    await workspaceRouteModules.secureDistribution();
}
