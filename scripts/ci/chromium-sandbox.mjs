import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
const restriction = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";
if (
  existsSync(restriction) &&
  readFileSync(restriction, "utf8").trim() === "1"
) {
  const executable = chromium.executablePath();
  if (
    !/^\/home\/runner\/\.cache\/ms-playwright\/chromium-\d+\/chrome-linux64\/chrome$/.test(
      executable,
    ) ||
    !existsSync(executable)
  ) {
    throw new Error(
      "Unexpected CI Chromium path; sandbox profile not installed.",
    );
  }
  const profile = `abi <abi/4.0>,\ninclude <tunables/global>\nprofile guteneo-ci-chromium "${executable}" flags=(unconfined) {\n  userns,\n}\n`;
  const path = "/etc/apparmor.d/guteneo-ci-chromium";
  execFileSync("sudo", ["-n", "tee", path], {
    input: profile,
    stdio: ["pipe", "ignore", "inherit"],
  });
  execFileSync("sudo", ["-n", "apparmor_parser", "-r", path], {
    stdio: "inherit",
  });
}
