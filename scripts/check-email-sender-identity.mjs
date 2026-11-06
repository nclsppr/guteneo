// Read-only local candidate/DNS inspection. Never creates DNS, certificates,
// provider settings or messages, and never qualifies actual inbox display.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { dmarcEnforcesAllMail } from "./email-sender-identity-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== "--dns"))
  throw new Error(
    "Usage: node scripts/check-email-sender-identity.mjs [--dns]",
  );

async function txt(name, fingerprintOnly = false) {
  try {
    const values = (await resolveTxt(name)).map((pieces) => pieces.join(""));
    return {
      name,
      status: values.length ? "present" : "absent",
      ...(fingerprintOnly
        ? {
            records: values.length,
            sha256: values.map((value) =>
              createHash("sha256").update(value).digest("hex"),
            ),
          }
        : { values }),
    };
  } catch (error) {
    const absent = ["ENODATA", "ENOTFOUND"].includes(error?.code);
    return { name, status: absent ? "absent" : "unavailable", values: [] };
  }
}

const { stdout } = await promisify(execFile)(
  "python3",
  ["scripts/build-bimi-logo.py", "--check"],
  { cwd: root, timeout: 10_000, maxBuffer: 64 * 1024 },
);
const report = {
  observedAt: new Date().toISOString(),
  localCandidate: JSON.parse(stdout),
  gmailDisplayQualified: false,
  qualification:
    "Local asset checks cannot establish certificate issuance, aligned message authentication or inbox display.",
};
if (arguments_.includes("--dns")) {
  const names = [
    "guteneo.com",
    "_dmarc.guteneo.com",
    "default._bimi.guteneo.com",
    "send.guteneo.com",
    "rsend.guteneo.com",
    "bounce.guteneo.com",
    "resend._domainkey.guteneo.com",
  ];
  const records = await Promise.all(
    names.map((name) => txt(name, name.includes("_domainkey"))),
  );
  report.dns = records;
  report.dnsPrerequisites = {
    dmarcEnforcement: dmarcEnforcesAllMail(records[1].values),
    bimiRecordPresent: records[2].values.some((value) =>
      /^v=BIMI1;/i.test(value),
    ),
    messageAlignmentVerified: false,
    certificateValidated: false,
  };
}
console.log(JSON.stringify(report, null, 2));
