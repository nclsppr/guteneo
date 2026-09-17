/** Plans only. Copy reviewed commands after approval; never runs remote mutations. */
const target = process.argv[2] ?? "staging";
if (!["staging", "production"].includes(target))
  throw new Error("Use staging or production");
console.log(
  `Guteneo ${target} infrastructure PLAN. No resource will be created.\n`,
);
for (const command of [
  `wrangler d1 create guteneo-${target} --jurisdiction eu`,
  `wrangler r2 bucket create guteneo-${target}-documents --jurisdiction eu`,
  `wrangler queues create guteneo-${target}-interactive`,
  `wrangler queues create guteneo-${target}-bulk`,
  `wrangler queues create guteneo-${target}-dlq`,
])
  console.log(command);
console.log(
  "\nAfter approval: record returned resource IDs in a dedicated configuration; do not reuse local-only. Bind R2 jurisdiction eu explicitly. Set identity/scanner/provider secrets through Wrangler secret, never this file. Do not deploy until deployment checklist passes.",
);
