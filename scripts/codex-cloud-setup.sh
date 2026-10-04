#!/usr/bin/env bash
# Development only. Provider credentials stay out of npm lifecycle processes.
set -euo pipefail
set +x

cd "$(dirname "${BASH_SOURCE[0]}")/.."
install_browser="${CODEX_CLOUD_INSTALL_BROWSER:-0}"
case "${1:-}" in
  "") ;;
  --with-browser) install_browser=1 ;;
  *) printf '%s\n' 'Usage: bash scripts/codex-cloud-setup.sh [--with-browser]' >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  printf '%s\n' 'Only --with-browser is supported.' >&2
  exit 2
fi

# Hosted sandboxes can have read-only home config/log/cache directories. Keep HOME
# unchanged and give this invocation its own private writable runtime directory.
# Legacy ~/.wrangler may still take precedence for config; this is not a
# filesystem credential sandbox. Only this freshly-created directory is removed.
umask 077
codex_runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/guteneo-codex-cloud.XXXXXX")"
readonly codex_runtime_dir
trap 'rm -rf -- "$codex_runtime_dir"' EXIT
mkdir -m 700 "$codex_runtime_dir/config" "$codex_runtime_dir/logs" "$codex_runtime_dir/npm-cache"

# Keep the cloud network proxy, but never inherit API keys, deployment flags,
# NODE_OPTIONS or arbitrary npm configuration into dependency lifecycle hooks.
# No .env/.dev.vars file is created or overwritten by this setup.
run_local() {
  env -i \
    PATH="$PATH" HOME="${HOME:-/tmp}" TMPDIR="${TMPDIR:-/tmp}" \
    HTTP_PROXY="${HTTP_PROXY:-}" HTTPS_PROXY="${HTTPS_PROXY:-}" \
    ALL_PROXY="${ALL_PROXY:-}" NO_PROXY="${NO_PROXY:-}" \
    http_proxy="${http_proxy:-}" https_proxy="${https_proxy:-}" \
    all_proxy="${all_proxy:-}" no_proxy="${no_proxy:-}" \
    SSL_CERT_FILE="${SSL_CERT_FILE:-}" SSL_CERT_DIR="${SSL_CERT_DIR:-}" \
    NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-}" \
    XDG_CONFIG_HOME="$codex_runtime_dir/config" \
    WRANGLER_LOG_PATH="$codex_runtime_dir/logs" \
    NPM_CONFIG_CACHE="$codex_runtime_dir/npm-cache" \
    CI=true NPM_CONFIG_USERCONFIG=/dev/null \
    ENVIRONMENT=local MODE=simulation LIVE_SENDS_ENABLED=false \
    POSTAL_DRAFTS_ENABLED=false RESEND_SENDS_ENABLED=false \
    WRANGLER_SEND_METRICS=false \
    "$@"
}

run_local node --input-type=module -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 16)) {
    console.error("Codex Cloud setup requires Node.js >=22.16.");
    process.exit(1);
  }
'
run_local npm ci
run_local npm run db:migrate
run_local npm run db:seed
run_local npm run build:web

if [[ "$install_browser" == 1 ]]; then
  if [[ "$(uname -s)" == Linux ]]; then
    run_local npm run browser:prepare
    printf '%s\n' 'Bundled Chromium prepared. Use GUTENEO_BUNDLED_CHROMIUM=1 for Chromium tests; WebKit and OS dependencies require separate preparation.'
  else
    printf '%s\n' 'Bundled Chromium preparation is Linux-only; skipped on this host.'
  fi
fi
run_local node scripts/codex-cloud-check.mjs --offline
printf '%s\n' 'Local simulation is prepared. Run the network check separately in the agent phase to verify configured provider access.'
