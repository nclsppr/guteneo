/** Illustrative workload, not commercial prices. Exact USD micro-units throughout. */
import { writeFileSync, mkdirSync } from "node:fs";
const positive = (v: bigint) => (v > 0n ? v : 0n);
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const usd = (v: bigint) =>
  `${v / 1_000_000n}.${(v % 1_000_000n).toString().padStart(6, "0")}`;
const rows = [1000n, 10000n, 100000n].map((n) => {
  const emails = (n * 70n) / 100n,
    faxes = n / 10n,
    letters = n / 5n;
  const uniqueDocuments = n / 2n,
    renders = uniqueDocuments / 2n;
  const requests = n * 20n + 43200n,
    cpuMs = requests * 10n;
  const queueOps = n * 3n + n / 20n;
  const browserSeconds = renders * 3n;
  const browserHours = (browserSeconds + 1800n) / 3600n;
  const storageBytes = uniqueDocuments * 500000n * 3n; // 500 kB, 90-day steady-state retention
  const d1Bytes = n * 12000n * 12n; // 12 kB metadata/dispatch, 12-month audit estimate
  const r2Gb = ceilDiv(storageBytes, 1_000_000_000n),
    d1Gb = ceilDiv(d1Bytes, 1_000_000_000n);
  const costs = {
    workers:
      5_000_000n +
      ceilDiv(positive(requests - 10_000_000n) * 300_000n, 1_000_000n) +
      ceilDiv(positive(cpuMs - 30_000_000n) * 20_000n, 1_000_000n),
    queues: ceilDiv(positive(queueOps - 1_000_000n) * 400_000n, 1_000_000n),
    r2:
      positive(r2Gb - 10n) * 15_000n +
      ceilDiv(positive(uniqueDocuments - 1_000_000n) * 4_500_000n, 1_000_000n) +
      ceilDiv(positive(n * 4n - 10_000_000n) * 360_000n, 1_000_000n),
    d1:
      positive(d1Gb - 5n) * 750_000n +
      ceilDiv(positive(n * 100n - 50_000_000n) * 1_000_000n, 1_000_000n) +
      ceilDiv(positive(n * 300n - 25_000_000_000n) * 1000n, 1_000_000n),
    browser: positive(browserHours - 10n) * 90_000n, // assumes <=10 average daily-peak concurrent sessions
    ses: emails * 160n, // Essentials $0.16/1000; attachment data additional if selected
    independentBackup: r2Gb * 15_000n, // storage-only scenario, independent account no allowance
  };
  return {
    monthlyDispatches: Number(n),
    email: Number(emails),
    fax: Number(faxes),
    postal: Number(letters),
    faxPages: Number(faxes * 2n),
    postalPages: Number(letters * 2n),
    uniqueDocuments: Number(uniqueDocuments),
    renders: Number(renders),
    events: Number(n * 3n),
    requests: Number(requests),
    queueOperations: Number(queueOps),
    r2Gb: Number(r2Gb),
    d1Gb: Number(d1Gb),
    browserHours: Number(browserHours),
    usd: Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, usd(v)])),
    knownSubtotalUsd: usd(Object.values(costs).reduce((a, b) => a + b, 0n)),
    excluded: [
      "fax transport + originating number",
      "postal print/postage",
      "identity with admin MFA",
      "malware scanning",
      "backup transfer/operations",
      "supervision and human operations",
      "tax/FX",
      "existing account allowance consumption",
    ],
  };
});
mkdirSync("reports", { recursive: true });
writeFileSync(
  "reports/cost-model.json",
  JSON.stringify(
    {
      verifiedOn: "2026-09-16",
      currency: "USD",
      scenario: "assumptions, no commercial quotation",
      rows,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(rows, null, 2));
