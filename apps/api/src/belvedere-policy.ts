export const BELVEDERE_ORIGIN = "https://belvedere.guteneo.com";
export const BELVEDERE_WATCHER_EMAIL = "nicolas@pieper.fr";

/** A server-selected origin only; never infer this from forwarding headers. */
export function isBelvedereBrowserOrigin(
  request: Request,
  env: { APP_ORIGIN: string },
): boolean {
  return (
    env.APP_ORIGIN === BELVEDERE_ORIGIN &&
    new URL(request.url).origin === BELVEDERE_ORIGIN
  );
}
