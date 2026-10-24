# guteneo Engineering

The Cloudflare Nimbus source for [engineering.guteneo.com](https://engineering.guteneo.com).

Read the [site contract and authoring guide](../../docs/ENGINEERING_SITE.md) for
content ownership, generated pages, validation and publication. Repository-wide
[rules](../../AGENTS.md) apply; the app-specific [agent guide](AGENT.md) describes
the Nimbus file layout.

From this directory:

```sh
npm ci
npm run build
npm run preview
```

The Node requirement is declared in `package.json`. `nimbus.json` records scaffold
provenance and the reviewed Nimbus baseline; `package-lock.json` pins dependencies.
