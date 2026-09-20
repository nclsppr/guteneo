/** Local-only scanner qualification bridge. Never deploy this helper. */
export default {
  fetch(request: Request, env: { SCANNER: Fetcher }) {
    const url = new URL(request.url);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
      return new Response("Local qualification only", { status: 403 });
    if (
      url.search ||
      !(
        (request.method === "GET" && url.pathname === "/scanner/health") ||
        (request.method === "POST" && url.pathname === "/scanner/scan")
      )
    )
      return new Response("Not found", { status: 404 });
    return env.SCANNER.fetch(
      new Request(
        `https://scanner.internal${url.pathname.slice("/scanner".length)}`,
        request,
      ),
    );
  },
};
