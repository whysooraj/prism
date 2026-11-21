#!/usr/bin/env bash
set -euo pipefail

# Prism - One-Line Universal MCP Installer
# Installs Prism and automatically configures Claude, Antigravity (agy), Cursor, OpenCode, Pi, Codex, and Cline.

INSTALL_DIR="${HOME}/.prism"
REPO_URL="https://github.com/whysooraj/prism.git"

echo "=== Installing Prism AI Context Infrastructure ==="

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
  echo "[1/4] Updating existing Prism installation in ${INSTALL_DIR}..."
  cd "${INSTALL_DIR}"
  git fetch --depth 1 origin main
  git reset --hard FETCH_HEAD
else
  echo "[1/4] Cloning Prism to ${INSTALL_DIR}..."
  rm -rf "${INSTALL_DIR}"
  git clone --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
  cd "${INSTALL_DIR}"
fi

# 3. Install dependencies and build
echo "[2/4] Installing dependencies and building..."
npm install --silent --no-audit --no-fund
npm run build --silent

ENTRYPOINT="${INSTALL_DIR}/dist/index.js"
chmod +x "${ENTRYPOINT}"

# 4. Universal Agent MCP Auto-Configurator
echo "[3/4] Configuring AI agents and clients..."

node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const prismBin = '${ENTRYPOINT}';
const mcpConfig = {
  command: 'node',
  args: [prismBin]
};

const configs = [
  // Claude Code
  { name: 'Claude Code', path: path.join(home, '.claude.json'), key: 'mcpServers', style: 'server' },
  // Claude Desktop Linux
  { name: 'Claude Desktop (Linux)', path: path.join(home, '.config', 'Claude', 'claude_desktop_config.json'), key: 'mcpServers', style: 'server' },
  // Claude Desktop macOS
  { name: 'Claude Desktop (macOS)', path: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), key: 'mcpServers', style: 'server' },
  // Antigravity / Gemini CLI
  { name: 'Antigravity (agy)', path: path.join(home, '.gemini', 'config', 'mcp_config.json'), key: 'mcpServers', style: 'server' },
  { name: 'Antigravity Runtime', path: path.join(home, '.gemini', 'antigravity', 'mcp_config.json'), key: 'mcpServers', style: 'server' },
  // Cursor
  { name: 'Cursor', path: path.join(home, '.config', 'Cursor', 'User', 'mcp.json'), key: 'mcpServers', style: 'server' },
  { name: 'Cursor (Alt)', path: path.join(home, '.cursor', 'mcp.json'), key: 'mcpServers', style: 'server' },
  // VS Code / Cline
  { name: 'VS Code / Cline', path: path.join(home, '.config', 'Code', 'User', 'mcp.json'), key: 'mcpServers', style: 'server' },
  // OpenCode
  { name: 'OpenCode', path: path.join(home, '.config', 'opencode', 'mcp.json'), key: 'mcpServers', style: 'server' },
  { name: 'OpenCode Global', path: path.join(home, '.opencode.json'), key: 'mcpServers', style: 'server' },
  // Pi Agent
  { name: 'Pi Agent', path: path.join(home, '.pi', 'mcp.json'), key: 'mcpServers', style: 'server' },
  { name: 'Pi Config', path: path.join(home, '.config', 'pi', 'mcp.json'), key: 'mcpServers', style: 'server' },
  // Codex
  { name: 'Codex CLI', path: path.join(home, '.codex', 'mcp.json'), key: 'mcpServers', style: 'server' }
];

let configuredCount = 0;

for (const target of configs) {
  try {
    let data = {};
    const dir = path.dirname(target.path);
    if (!fs.existsSync(dir)) {
      // Don't create random non-existent client folders
      continue;
    }

    if (fs.existsSync(target.path)) {
      try {
        const raw = fs.readFileSync(target.path, 'utf8');
        data = JSON.parse(raw);
      } catch (err) {
        data = {};
      }
    }

    if (!data[target.key] || typeof data[target.key] !== 'object') {
      data[target.key] = {};
    }

    data[target.key]['prism'] = mcpConfig;
    fs.writeFileSync(target.path, JSON.stringify(data, null, 2) + '\n');
    console.log('  + Configured ' + target.name + ' (' + target.path + ')');
    configuredCount++;
  } catch (err) {
    // Ignore permissions or missing dirs
  }
}

if (configuredCount === 0) {
  console.log('  ! Note: No existing agent configs found yet. Prism binary is ready at: ' + prismBin);
}
"

# 5. Verification
echo "[4/4] Verifying installation..."
if [ -s "${ENTRYPOINT}" ]; then
  echo "  ✓ Prism binary verified at ${ENTRYPOINT}"
else
  echo "Error: Prism build failed to produce ${ENTRYPOINT}" >&2
  exit 1
fi

echo ""
echo "=== Prism Installed Successfully ==="
echo "Binary: ${ENTRYPOINT}"
echo "Restart your AI agent (claude, agy, cursor, opencode, pi) to begin using Prism."
