export function buildMcpUiProbeResource(options?: {
  check?: boolean;
}): Promise<{
  text: string;
  manifest: {
    path: string;
    bytes: number;
    sha256: string;
    resourceUri: string;
  };
}>;
