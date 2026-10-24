# Guteneo Claude Code distribution candidate

`plugins/guteneo/` is a self-contained Claude Code plugin. Its seven workflows are
adapted from the common Guteneo package, with a Claude-specific host contract and
without OpenAI agent metadata. Keep domain/approval safeguards aligned when the
common workflows change; do not copy host-specific file-transfer claims between
them.

`.claude-plugin/marketplace.json` is a local distribution catalogue named
`guteneo-plugins`, with one relative source: `./plugins/guteneo`. It is not the
Anthropic directory and is not registered or published by building its ZIP.

The integration builder emits:

| Archive                          | Root after extraction                                    | Purpose                                                                    |
| -------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `guteneo-claude-code.zip`        | `.claude-plugin/plugin.json`                             | Load the plugin directly with `--plugin-dir`.                              |
| `guteneo-claude-marketplace.zip` | `.claude-plugin/marketplace.json` and `plugins/guteneo/` | Register a reviewed local marketplace and persistently install its plugin. |

After extracting the marketplace archive into an empty directory named
`guteneo-claude-marketplace`, the documented local installation is:

```sh
claude plugin validate ./guteneo-claude-marketplace
claude plugin marketplace add ./guteneo-claude-marketplace
claude plugin install guteneo@guteneo-plugins
```

These commands are instructions for an explicitly chosen installation. They have
not been run as part of candidate preparation. Then read the plugin's
[README](plugins/guteneo/README.md), complete the host's normal OAuth connection
and begin with `/guteneo:get-started`. If authentication fails, resolve the actual
client-registration prerequisite before attempting a business operation.

The plugin ID remains `guteneo`. Do not install the combined compatibility
package alongside this package as a second copy. Both point to the same service;
neither changes the OpenAI public plugin's identity or registration.

Build and validation details are in the repository's `docs/CLAUDE_PLUGIN.md`;
that engineering evidence is separate from these installable files.
Official format: [Claude Code marketplaces](https://code.claude.com/docs/en/plugin-marketplaces).
