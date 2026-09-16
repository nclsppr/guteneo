/** Local-only qualification bridge. Never deploy this helper. */
export default {
  async fetch(request: Request, env: { SCANNER: Fetcher; DOCUMENTS: Fetcher }) {
    const url = new URL(request.url);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
      return new Response("Local qualification only", { status: 403 });
    const [service, ...segments] = url.pathname.slice(1).split("/");
    const binding =
      service === "scanner"
        ? env.SCANNER
        : service === "documents"
          ? env.DOCUMENTS
          : undefined;
    if (!binding) return new Response("Not found", { status: 404 });
    return binding.fetch(
      new Request(`https://private.internal/${segments.join("/")}`, request),
    );
  },
};
