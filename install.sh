#!/usr/bin/env bash
set -euo pipefail

# Prism - One-Line Universal MCP & Agent Skills Installer
# Installs Prism and configures 70+ AI agents (OpenClaw, Hermes, Antigravity, Claude, Cursor, OpenCode, Pi, Codex, Cline, Devin, Goose, Windsurf).

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
SKILL_SOURCE="${INSTALL_DIR}/skills/prism/SKILL.md"

# 4. Universal Agent MCP Auto-Configurator
echo "[3/4] Configuring AI agent MCP endpoints & skills..."

node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const prismBin = '${ENTRYPOINT}';
const skillSource = '${SKILL_SOURCE}';

const mcpConfig = {
  command: 'node',
  args: [prismBin]
};

// 1. MCP Server configurations
const mcpTargets = [
  { name: 'Claude Code', path: path.join(home, '.claude.json'), key: 'mcpServers' },
  { name: 'Claude Desktop (Linux)', path: path.join(home, '.config', 'Claude', 'claude_desktop_config.json'), key: 'mcpServers' },
  { name: 'Claude Desktop (macOS)', path: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), key: 'mcpServers' },
  { name: 'Antigravity (agy)', path: path.join(home, '.gemini', 'config', 'mcp_config.json'), key: 'mcpServers' },
  { name: 'Antigravity Runtime', path: path.join(home, '.gemini', 'antigravity', 'mcp_config.json'), key: 'mcpServers' },
  { name: 'Cursor', path: path.join(home, '.config', 'Cursor', 'User', 'mcp.json'), key: 'mcpServers' },
  { name: 'Cursor (Alt)', path: path.join(home, '.cursor', 'mcp.json'), key: 'mcpServers' },
  { name: 'VS Code / Cline', path: path.join(home, '.config', 'Code', 'User', 'mcp.json'), key: 'mcpServers' },
  { name: 'OpenCode', path: path.join(home, '.config', 'opencode', 'mcp.json'), key: 'mcpServers' },
  { name: 'OpenCode Global', path: path.join(home, '.opencode.json'), key: 'mcpServers' },
  { name: 'OpenClaw', path: path.join(home, '.openclaw', 'mcp.json'), key: 'mcpServers' },
  { name: 'Hermes Agent', path: path.join(home, '.hermes', 'mcp.json'), key: 'mcpServers' },
  { name: 'Pi Agent', path: path.join(home, '.pi', 'mcp.json'), key: 'mcpServers' },
  { name: 'Codex CLI', path: path.join(home, '.codex', 'mcp.json'), key: 'mcpServers' },
  { name: 'Goose', path: path.join(home, '.config', 'goose', 'mcp.json'), key: 'mcpServers' },
  { name: 'Devin', path: path.join(home, '.config', 'devin', 'mcp.json'), key: 'mcpServers' },
  { name: 'Windsurf', path: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'), key: 'mcpServers' }
];

let mcpConfigured = 0;
for (const target of mcpTargets) {
  try {
    const dir = path.dirname(target.path);
    if (!fs.existsSync(dir)) continue;

    let data = {};
    if (fs.existsSync(target.path)) {
      try {
        data = JSON.parse(fs.readFileSync(target.path, 'utf8'));
      } catch (err) {
        data = {};
      }
    }

    if (!data[target.key] || typeof data[target.key] !== 'object') {
      data[target.key] = {};
    }

    data[target.key]['prism'] = mcpConfig;
    fs.writeFileSync(target.path, JSON.stringify(data, null, 2) + '\n');
    console.log('  + [MCP] Configured ' + target.name);
    mcpConfigured++;
  } catch (err) {}
}

// 2. Universal Agent Skills (Vercel Labs / agentskills.io standard)
const skillDirs = [
  // Universal standard (used by 30+ agents: Cursor, Codex, Cline, OpenCode, Pi, Zed, Warp, Amp, etc.)
  { name: 'Universal (~/.agents/skills)', dir: path.join(home, '.agents', 'skills', 'prism'), always: true },
  { name: 'OpenClaw', dir: path.join(home, '.openclaw', 'skills', 'prism') },
  { name: 'Hermes Agent', dir: path.join(home, '.hermes', 'skills', 'prism') },
  { name: 'Antigravity / Gemini', dir: path.join(home, '.gemini', 'config', 'skills', 'prism') },
  { name: 'Claude Code', dir: path.join(home, '.claude', 'skills', 'prism') },
  { name: 'Cursor Skills', dir: path.join(home, '.cursor', 'skills', 'prism') },
  { name: 'Devin Skills', dir: path.join(home, '.config', 'devin', 'skills', 'prism') },
  { name: 'Goose Skills', dir: path.join(home, '.config', 'goose', 'skills', 'prism') },
  { name: 'Continue Skills', dir: path.join(home, '.continue', 'skills', 'prism') },
  { name: 'Droid / Factory', dir: path.join(home, '.factory', 'skills', 'prism') },
  { name: 'Roo Code', dir: path.join(home, '.roo', 'skills', 'prism') },
  { name: 'AiderDesk', dir: path.join(home, '.aider-desk', 'skills', 'prism') },
  { name: 'OpenHands', dir: path.join(home, '.openhands', 'skills', 'prism') },
  { name: 'Qwen Skills', dir: path.join(home, '.qwen', 'skills', 'prism') }
];

let skillsConfigured = 0;
if (fs.existsSync(skillSource)) {
  const content = fs.readFileSync(skillSource, 'utf8');

  for (const s of skillDirs) {
    try {
      const parentDir = path.dirname(s.dir);
      if (s.always || fs.existsSync(parentDir)) {
        fs.mkdirSync(s.dir, { recursive: true });
        fs.writeFileSync(path.join(s.dir, 'SKILL.md'), content);
        console.log('  + [Skill] Injected SKILL.md into ' + s.name);
        skillsConfigured++;
      }
    } catch (err) {}
  }
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
echo "Restart your AI agent (openclaw, hermes, agy, claude, cursor, opencode, pi, etc.) to activate Prism."
