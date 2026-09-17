/** Loaded only after the reader explicitly opens the reference. No API execution. */
export async function mountSwagger(element: HTMLElement): Promise<void> {
  const [module, response] = await Promise.all([
    // @ts-expect-error The pinned Swagger UI distribution ships no TypeScript declarations.
    import("swagger-ui-dist/swagger-ui-es-bundle.js"),
    fetch("/openapi.json", { credentials: "omit", redirect: "error" }),
    import("swagger-ui-dist/swagger-ui.css"),
  ]);
  if (!response.ok) throw new Error("REFERENCE_UNAVAILABLE");
  const spec: unknown = await response.json();
  const SwaggerUI = module.default as (
    config: Record<string, unknown>,
  ) => unknown;
  SwaggerUI({
    domNode: element,
    spec,
    layout: "BaseLayout",
    deepLinking: false,
    docExpansion: "list",
    defaultModelsExpandDepth: -1,
    displayOperationId: true,
    supportedSubmitMethods: [],
    tryItOutEnabled: false,
    validatorUrl: null,
    queryConfigEnabled: false,
    persistAuthorization: false,
    withCredentials: false,
    // Hide OAuth entry points; this reader never needs an access token.
    plugins: [
      () => ({ components: { authorizeBtn: () => null, auths: () => null } }),
    ],
    // Defence in depth against validator, spec override or future request features.
    requestInterceptor: () => {
      throw new Error("REFERENCE_NETWORK_DISABLED");
    },
  });
}
