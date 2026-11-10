function viewModule<T>(load: () => Promise<T>) {
  let request: Promise<T> | undefined;
  return () =>
    (request ??= load().catch((error: unknown) => {
      request = undefined;
      throw error;
    }));
}

/** Read-only view code; API authorization remains in every data read. */
export const belvedereViewModules = {
  overview: viewModule(() => import("./belvedere-overview")),
  workshops: viewModule(() => import("./belvedere-workshops")),
  members: viewModule(() => import("./belvedere-members")),
  jobs: viewModule(() => import("./belvedere-jobs")),
  connections: viewModule(() => import("./belvedere-connections")),
  finance: viewModule(() => import("./belvedere-finance")),
  infrastructure: viewModule(() => import("./belvedere-infrastructure")),
};
export async function preloadBelvedereView(hash: string) {
  const requested = hash.replace(/^#/, "").split(/[/?]/)[0];
  const view = Object.hasOwn(belvedereViewModules, requested)
    ? (requested as keyof typeof belvedereViewModules)
    : "overview";
  await belvedereViewModules[view]();
}
