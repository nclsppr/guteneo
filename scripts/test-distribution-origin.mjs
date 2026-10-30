function localPort(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
    throw new Error("Distribution fixtures require a valid local port.");
  return port;
}

export const distributionPort = localPort(
  process.env.GUTENEO_DISTRIBUTION_E2E_PORT,
  8787,
);
export const distributionRendererPort = localPort(
  process.env.GUTENEO_LOCAL_RENDERER_PORT,
  8788,
);
if (distributionPort === distributionRendererPort)
  throw new Error("Distribution fixtures require distinct local ports.");
export const distributionOrigin = `http://localhost:${distributionPort}`;
