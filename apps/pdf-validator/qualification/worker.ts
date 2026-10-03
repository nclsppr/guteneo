interface QualificationEnv {
  HORIZON_QUALIFICATION_TOKEN?: string;
  PDF_VALIDATOR: Fetcher;
  QUALIFICATION: {
    release(): Promise<{ sourceCommit: string; workerVersion: string }>;
    state(): Promise<{ status: string }>;
    stop(): Promise<{ status: string }>;
    privacy(): Promise<{ temporaryDirectories: number }>;
    processDeadline(): Promise<{ code: string; temporaryDirectories: number }>;
  };
}

/** Local-only Wrangler bridge using authenticated remote service bindings. */
export default {
  async fetch(request: Request, env: QualificationEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!new Set(["127.0.0.1", "localhost"]).has(url.hostname))
      return Response.json({ code: "LOCAL_PROBE_ONLY" }, { status: 403 });
    // This bridge is CLI-only. A loopback destination does not authenticate a
    // browser caller; reject every Origin before any private binding access.
    if (request.headers.has("Origin"))
      return Response.json(
        { code: "LOCAL_PROBE_ORIGIN_FORBIDDEN" },
        { status: 403 },
      );
    const expectedToken = env.HORIZON_QUALIFICATION_TOKEN;
    const suppliedToken = request.headers.get("X-Horizon-Qualification-Token");
    if (
      !/^[a-f0-9]{64}$/.test(expectedToken ?? "") ||
      !/^[a-f0-9]{64}$/.test(suppliedToken ?? "") ||
      suppliedToken !== expectedToken
    )
      return Response.json(
        { code: "LOCAL_PROBE_UNAUTHORIZED" },
        { status: 403 },
      );
    try {
      if (
        request.method === "GET" &&
        url.pathname === "/release" &&
        !url.search
      )
        return Response.json(await env.QUALIFICATION.release());
      if (request.method === "GET" && url.pathname === "/state" && !url.search)
        return Response.json(await env.QUALIFICATION.state());
      if (
        request.method === "GET" &&
        url.pathname === "/privacy" &&
        !url.search
      )
        return Response.json(await env.QUALIFICATION.privacy());
      if (request.method === "POST" && url.pathname === "/stop" && !url.search)
        return Response.json(await env.QUALIFICATION.stop());
      if (
        request.method === "POST" &&
        url.pathname === "/process-deadline" &&
        !url.search
      )
        return Response.json(await env.QUALIFICATION.processDeadline());
      if (
        (request.method === "GET" &&
          url.pathname === "/health" &&
          !url.search) ||
        (request.method === "POST" && url.pathname === "/validate")
      ) {
        // The real service validates these parameters/body bounds; retain negative tests.
        // The local per-run credential must never cross a remote service binding.
        const headers = new Headers(request.headers);
        headers.delete("X-Horizon-Qualification-Token");
        return await env.PDF_VALIDATOR.fetch(
          new Request(
            `https://validator.internal${url.pathname}${url.search}`,
            {
              method: request.method,
              body: request.body,
              headers,
              signal: request.signal,
              ...(request.body ? { duplex: "half" as const } : {}),
            },
          ),
        );
      }
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    } catch {
      return Response.json(
        { code: "PRIVATE_PROBE_UNAVAILABLE" },
        { status: 503 },
      );
    }
  },
};
