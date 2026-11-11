import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deployExperience } from "../../scripts/deploy-experience.mjs";
import {
  createExperienceRelease,
  experienceManifest,
  experienceSourceSnapshot,
  experienceSourceScope,
  readExperienceConfig,
  validateExperienceConfig,
  verifyExperienceBackend,
  verifyExperienceRelease,
} from "../../scripts/experience-release.mjs";

const config = await readExperienceConfig(
  new URL("../../apps/experience/wrangler.jsonc", import.meta.url),
);
const git = (root, ...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const headers = `/*
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://guteneo.com; frame-ancestors 'none'
  X-Robots-Tag: noindex, nofollow
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
`;
async function fixture(context) {
  const temporary = await mkdtemp(join(tmpdir(), "guteneo-gare-release-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "checkout"),
    remote = join(temporary, "origin.git");
  await mkdir(root);
  git(temporary, "init", "--bare", remote);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "Synthetic release test");
  git(root, "config", "user.email", "release@example.test");
  await mkdir(join(root, "apps/experience/src"), { recursive: true });
  await writeFile(join(root, ".gitignore"), "dist/\n");
  await writeFile(
    join(root, "apps/experience/src/main.ts"),
    "export const synthetic = true;\n",
  );
  await writeFile(
    join(root, "apps/experience/wrangler.jsonc"),
    JSON.stringify(config),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Synthetic reviewed station source");
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-u", "origin", "main");
  const commit = git(root, "rev-parse", "HEAD"),
    output = join(root, "dist/experience");
  async function seal() {
    const manifest = await createExperienceRelease(root, {
      commit,
      dirty: false,
      snapshot: await experienceSourceSnapshot(root),
    });
    await writeFile(join(output, "release.json"), JSON.stringify(manifest));
    return manifest;
  }
  async function build() {
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, "index.html"),
      "<!doctype html><title>Synthetic station</title>",
    );
    await writeFile(join(output, "boot.js"), "/* Synthetic bootstrap */");
    await writeFile(join(output, "_headers"), headers);
    return seal();
  }
  return { root, output, commit, build, seal };
}

test("Gare config is one asset-only domain with all alternate hosts disabled", () => {
  assert.doesNotThrow(() => validateExperienceConfig(config));
  for (const change of [
    { main: "src/worker.ts" },
    { vars: {} },
    { d1_databases: [] },
    { workers_dev: true },
    { preview_urls: true },
    { routes: [{ pattern: "guteneo.com", custom_domain: true }] },
    { assets: { ...config.assets, binding: "ASSETS" } },
    { account_id: "another-account" },
  ])
    assert.throws(
      () => validateExperienceConfig({ ...config, ...change }),
      /ASSET_ONLY/,
    );
});

test("clean reviewed main and its exact source/assets are qualified before publication", async (context) => {
  const f = await fixture(context),
    calls = [];
  const result = await deployExperience(f.commit, {
    root: f.root,
    inspectBackend: async () => calls.push("backend"),
    execute: async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (args[1] === "build:experience") await f.build();
    },
  });
  assert.equal(result.origin, "https://gare.guteneo.com");
  assert.ok(
    calls.indexOf("backend") <
      calls.findIndex((call) => call.startsWith("npx")),
  );
  assert.ok(calls.includes("npm run test:experience"));
  await verifyExperienceRelease(f.root, f.commit);
});

for (const state of [
  "branch",
  "dirty",
  "untracked",
  "hidden-index",
  "stale-main",
  "unreviewed-commit",
]) {
  test(`publication refuses ${state} before any build or network call`, async (context) => {
    const f = await fixture(context),
      calls = [];
    if (state === "branch") git(f.root, "checkout", "-b", "codex/synthetic");
    if (state === "dirty")
      await writeFile(
        join(f.root, "apps/experience/src/main.ts"),
        "Changed source",
      );
    if (state === "untracked")
      await writeFile(join(f.root, "unexpected.txt"), "Unreviewed source");
    if (state === "hidden-index")
      git(
        f.root,
        "update-index",
        "--assume-unchanged",
        "apps/experience/src/main.ts",
      );
    if (state === "stale-main") {
      git(f.root, "commit", "--allow-empty", "-m", "New main");
      git(f.root, "push", "origin", "main");
      git(f.root, "reset", "--hard", f.commit);
      git(f.root, "update-ref", "refs/remotes/origin/main", f.commit);
    }
    await assert.rejects(
      deployExperience(
        state === "unreviewed-commit" ? "f".repeat(40) : f.commit,
        {
          root: f.root,
          execute: async () => calls.push("execute"),
          inspectBackend: async () => calls.push("backend"),
        },
      ),
      /RELEASE_|EXPERIENCE_REVIEWED_COMMIT_MISMATCH/,
    );
    assert.equal(calls.length, 0);
  });
}

for (const mutation of ["changed", "added", "removed", "resealed"]) {
  test(`publication rejects ${mutation} build after browser checks`, async (context) => {
    const f = await fixture(context);
    await f.build();
    const expected = await verifyExperienceRelease(f.root, f.commit);
    if (mutation === "changed" || mutation === "resealed")
      await writeFile(join(f.output, "boot.js"), "replacement");
    if (mutation === "added")
      await writeFile(join(f.output, "unexpected.js"), "unexpected");
    if (mutation === "removed") await rm(join(f.output, "boot.js"));
    if (mutation === "resealed") await f.seal();
    await assert.rejects(
      verifyExperienceRelease(f.root, f.commit, expected),
      /EXPERIENCE_(RELEASE_ASSETS_MISMATCH|MISSING_ASSET)/,
    );
  });
}

test("publication does not permit backend readiness failure", async (context) => {
  const f = await fixture(context),
    calls = [];
  await assert.rejects(
    deployExperience(f.commit, {
      root: f.root,
      inspectBackend: async () => {
        throw new Error("Backend unavailable");
      },
      execute: async (command, args) => {
        calls.push(command);
        if (args[1] === "build:experience") await f.build();
      },
    }),
    /Backend unavailable/,
  );
  assert.equal(calls.includes("npx"), false);
});

for (const asset of ["source.map", "secret.key", "local.js", "link.js"]) {
  test(`publication refuses unsafe asset ${asset}`, async (context) => {
    const f = await fixture(context);
    await f.build();
    if (asset === "link.js")
      await symlink(join(f.output, "boot.js"), join(f.output, asset));
    else
      await writeFile(
        join(f.output, asset),
        asset === "local.js"
          ? "fetch('http://localhost:8787/api/session')"
          : "private",
      );
    await assert.rejects(
      experienceManifest(f.output),
      /EXPERIENCE_PRIVATE|regular files/,
    );
  });
}

function backend({
  mode = "production",
  simulation = false,
  grant = "https://gare.guteneo.com",
  credentials = "true",
  open = false,
} = {}) {
  return async (url, options) => {
    const headers = {
      "Access-Control-Allow-Origin": grant,
      "Access-Control-Allow-Credentials": credentials,
    };
    if (url.endsWith("/capabilities"))
      return Response.json({ mode, simulation }, { headers });
    if (options.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Headers":
            "Content-Type, X-CSRF-Token, Idempotency-Key",
        },
      });
    return new Response(null, { status: open ? 200 : 401 });
  };
}
test("backend qualification accepts only production, exact CORS and closed unauthenticated API", async () => {
  await verifyExperienceBackend(backend());
  for (const options of [
    { mode: "simulation" },
    { simulation: true },
    { grant: "*" },
    { grant: "https://another.guteneo.com" },
    { credentials: "false" },
    { open: true },
  ])
    await assert.rejects(
      verifyExperienceBackend(backend(options)),
      /EXPERIENCE_/,
    );
});

test("release source scope includes the actual browser suite", async () => {
  const config = await readFile(
    new URL("../../playwright.experience.config.ts", import.meta.url),
    "utf8",
  );
  const directory = config.match(/testDir:\s*["']([^"']+)["']/)?.[1];
  assert.ok(directory);
  assert.ok(experienceSourceScope.includes(directory.replace(/^\.\//, "")));
});
