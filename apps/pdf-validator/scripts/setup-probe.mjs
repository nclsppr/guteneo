import { createProbeCredential } from "./probe-credentials.mjs";

if (process.argv.length !== 2)
  throw new Error(
    "Probe setup takes no arguments; credentials are never CLI values",
  );
createProbeCredential();
console.log(
  "Local qualification credential created with owner-only permissions. Start the loopback probe after this step.",
);
