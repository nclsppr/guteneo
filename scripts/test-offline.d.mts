export type OfflineNetworkProof = {
  loopbackAllowed: true;
  externalBlocked: true;
  childProcessProtected: true;
  denialCode: "EPERM" | "EACCES";
};

/** Throws unless this macOS process and its descendants already deny external network access. */
export function verifyInheritedNetworkBoundary(): Promise<OfflineNetworkProof>;
