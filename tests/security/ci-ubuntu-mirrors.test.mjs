import assert from "node:assert/strict";
import test from "node:test";
import { preferUbuntuArchives } from "../../scripts/ci/ubuntu-mirrors.mjs";

const mirrorUri = "mirror+file:/etc/apt/apt-mirrors.txt";
const azure = "http://azure.archive.ubuntu.com/ubuntu/\tpriority:1";
const archives = "https://archive.ubuntu.com/ubuntu/\tpriority:2";
const security = "https://security.ubuntu.com/ubuntu/\tpriority:3";
const mirrors = `${azure}\n${archives}\n${security}\n`;
const sources = Object.freeze([
  Object.freeze({
    path: "/etc/apt/sources.list.d/ubuntu.sources",
    content: `Types: deb\nURIs: ${mirrorUri}\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n`,
  }),
]);

test("changes only the recognized Azure priority and preserves every source field", () => {
  const before = structuredClone(sources);
  const preferred = preferUbuntuArchives(sources, mirrors);
  assert.equal(preferred, mirrors.replace("priority:1", "priority:4"));
  assert.deepEqual(sources, before);
  assert.equal(preferUbuntuArchives(sources, preferred), preferred);
});

test("retains comments, ordering, whitespace and line endings in a recognized list", () => {
  const current = `# Existing runner preferences\r\n${security}\r\n  ${azure}\t\r\n\r\n${archives}\r\n`;
  assert.equal(
    preferUbuntuArchives(sources, current),
    current.replace("priority:1", "priority:4"),
  );
});

test("supports active traditional and deb822 mirror sources without rewriting them", () => {
  for (const source of [
    {
      path: "/etc/apt/sources.list",
      content: `deb [arch=amd64 signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] ${mirrorUri} noble main\n`,
    },
    {
      path: "/etc/apt/sources.list.d/ubuntu.sources",
      content: `Enabled: yes\nTypes: deb deb-src\nURIs: ${mirrorUri}\nSuites: noble-security\n`,
    },
  ]) {
    const selected = Object.freeze([Object.freeze(source)]);
    const before = structuredClone(selected);
    assert.equal(
      preferUbuntuArchives(selected, mirrors),
      mirrors.replace("priority:1", "priority:4"),
    );
    assert.deepEqual(selected, before);
  }
});

test("leaves unknown mirror layouts byte-for-byte unchanged without throwing", () => {
  const unknown = [
    "",
    "# An unfamiliar runner layout\r\nhttps://mirror.example.invalid/ubuntu/\tpriority:1\r\n",
    mirrors.replace("priority:1", "priority:2"),
    mirrors.replace("http://azure.", "https://azure."),
    mirrors.replace(archives, "https://archive.ubuntu.com/ubuntu/\tpriority:1"),
    mirrors.replace(security + "\n", ""),
    mirrors + azure + "\n",
    mirrors + "https://mirror.example.invalid/ubuntu/\tpriority:4\n",
    mirrors.replace("\tpriority:1", " priority:1"),
  ];
  const before = structuredClone(sources);
  for (const current of unknown) {
    let result;
    assert.doesNotThrow(() => {
      result = preferUbuntuArchives(sources, current);
    });
    assert.equal(result, current);
    assert.deepEqual(sources, before);
  }
});

test("retains runner defaults when the mirror file is not selected by an active source", () => {
  for (const selected of [
    [],
    [
      {
        path: "/etc/apt/sources.list",
        content: `# deb ${mirrorUri} noble main\n`,
      },
    ],
    [
      {
        path: "/etc/apt/sources.list",
        content: "deb https://archive.ubuntu.com/ubuntu/ noble main\n",
      },
    ],
    [
      {
        path: "/etc/apt/sources.list.d/ubuntu.sources",
        content: `Enabled: no\nTypes: deb\nURIs: ${mirrorUri}\nSuites: noble\n`,
      },
    ],
    [
      {
        path: "/etc/apt/sources.list.d/ubuntu.sources",
        content: `Enabled: yes\nEnabled: no\nTypes: deb\nURIs: ${mirrorUri}\nSuites: noble\n`,
      },
    ],
  ]) {
    const before = structuredClone(selected);
    assert.equal(preferUbuntuArchives(selected, mirrors), mirrors);
    assert.deepEqual(selected, before);
  }
});
