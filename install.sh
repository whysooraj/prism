#!/usr/bin/env bash
set -euo pipefail

# Prism - One-Line Universal MCP & Agent Skills Installer
# Interactive installer supporting Global vs Local Project installation across 70+ AI agents.

INSTALL_DIR="${HOME}/.prism"
REPO_URL="https://github.com/whysooraj/prism.git"

# Re-attach terminal stdin if running from curl piped to bash
if [ ! -t 0 ] && [ -e /dev/tty ]; then
  exec < /dev/tty
fi

echo "=== Prism AI Context Infrastructure Installer ==="

# 1. Check prerequisites
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not installed. Please install Node.js >= 20." >&2
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "${NODE_MAJOR}" -lt 20 ]; then
  echo "Error: Node.js >= 20 is required (found $(node -v))." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required but not installed." >&2
  exit 1
fi

# 2. Clone or update repository
if [ -d "${INSTALL_DIR}/.git" ]; then
  echo "[1/3] Updating existing Prism installation in ${INSTALL_DIR}..."
  cd "${INSTALL_DIR}"
  git fetch --depth 1 origin main
  git reset --hard FETCH_HEAD
else
  echo "[1/3] Cloning Prism to ${INSTALL_DIR}..."
  rm -rf "${INSTALL_DIR}"
  git clone --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
  cd "${INSTALL_DIR}"
fi

# 3. Install dependencies and build
echo "[2/3] Building Prism binary..."
npm install --silent --no-audit --no-fund
npm run build --silent

ENTRYPOINT="${INSTALL_DIR}/dist/index.js"
chmod +x "${ENTRYPOINT}"
chmod +x "${INSTALL_DIR}/scripts/configure.js"

if [ ! -s "${ENTRYPOINT}" ]; then
  echo "Error: Prism build failed to produce ${ENTRYPOINT}" >&2
  exit 1
fi

# 4. Interactive Configuration & Scope Selection
echo "[3/3] Launching Agent & MCP Configurator..."
node "${INSTALL_DIR}/scripts/configure.js" "$@"
