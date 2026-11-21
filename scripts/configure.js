#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const home = os.homedir();
const cwd = process.cwd();

// Parse CLI flags
const args = process.argv.slice(2);
const isNonInteractive = args.includes('-y') || args.includes('--yes') || !process.stdin.isTTY;
let scopeFlag = args.includes('-g') || args.includes('--global') ? 'global' : null;
if (!scopeFlag && (args.includes('-l') || args.includes('--local') || args.includes('--project'))) {
  scopeFlag = 'local';
}
if (!scopeFlag && args.includes('--both')) {
  scopeFlag = 'both';
}

const AGENT_DEFINITIONS = [
  {
    id: 'antigravity',
    name: 'Google DeepMind Antigravity (agy)',
    detected: () => fs.existsSync(path.join(home, '.gemini')),
    globalMcp: path.join(home, '.gemini', 'config', 'mcp_config.json'),
    localMcp: path.join(cwd, '.gemini', 'mcp_config.json'),
    globalSkill: path.join(home, '.gemini', 'config', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.agents', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'claude',
    name: 'Anthropic Claude Code & Desktop',
    detected: () => fs.existsSync(path.join(home, '.claude.json')) || fs.existsSync(path.join(home, '.claude')),
    globalMcp: path.join(home, '.claude.json'),
    localMcp: path.join(cwd, '.claude.json'),
    globalSkill: path.join(home, '.claude', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.claude', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'cursor',
    name: 'Anysphere Cursor',
    detected: () => fs.existsSync(path.join(home, '.cursor')) || fs.existsSync(path.join(home, '.config', 'Cursor')),
    globalMcp: path.join(home, '.config', 'Cursor', 'User', 'mcp.json'),
    localMcp: path.join(cwd, '.cursor', 'mcp.json'),
    globalSkill: path.join(home, '.cursor', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.agents', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    detected: () => fs.existsSync(path.join(home, '.openclaw')),
    globalMcp: path.join(home, '.openclaw', 'mcp.json'),
    localMcp: path.join(cwd, '.openclaw', 'mcp.json'),
    globalSkill: path.join(home, '.openclaw', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'hermes',
    name: 'Hermes Agent (Nous Research)',
    detected: () => fs.existsSync(path.join(home, '.hermes')),
    globalMcp: path.join(home, '.hermes', 'mcp.json'),
    localMcp: path.join(cwd, '.hermes', 'mcp.json'),
    globalSkill: path.join(home, '.hermes', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.hermes', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'opencode',
    name: 'OpenCode Project',
    detected: () => fs.existsSync(path.join(home, '.config', 'opencode')) || fs.existsSync(path.join(home, '.opencode.json')),
    globalMcp: path.join(home, '.config', 'opencode', 'mcp.json'),
    localMcp: path.join(cwd, '.opencode', 'mcp.json'),
    globalSkill: path.join(home, '.config', 'opencode', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.agents', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'pi',
    name: 'Pi Agent (Inflection)',
    detected: () => fs.existsSync(path.join(home, '.pi')) || fs.existsSync(path.join(home, '.config', 'pi')),
    globalMcp: path.join(home, '.pi', 'mcp.json'),
    localMcp: path.join(cwd, '.pi', 'mcp.json'),
    globalSkill: path.join(home, '.agents', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.agents', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    detected: () => fs.existsSync(path.join(home, '.codex')),
    globalMcp: path.join(home, '.codex', 'mcp.json'),
    localMcp: path.join(cwd, '.codex', 'mcp.json'),
    globalSkill: path.join(home, '.agents', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.agents', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'cline',
    name: 'Cline / Roo Code (VS Code)',
    detected: () => fs.existsSync(path.join(home, '.config', 'Code')) || fs.existsSync(path.join(home, '.roo')),
    globalMcp: path.join(home, '.config', 'Code', 'User', 'mcp.json'),
    localMcp: path.join(cwd, '.vscode', 'mcp.json'),
    globalSkill: path.join(home, '.roo', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.roo', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'devin',
    name: 'Devin for Terminal',
    detected: () => fs.existsSync(path.join(home, '.config', 'devin')),
    globalMcp: path.join(home, '.config', 'devin', 'mcp.json'),
    localMcp: path.join(cwd, '.devin', 'mcp.json'),
    globalSkill: path.join(home, '.config', 'devin', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.devin', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'goose',
    name: 'Goose CLI',
    detected: () => fs.existsSync(path.join(home, '.config', 'goose')),
    globalMcp: path.join(home, '.config', 'goose', 'mcp.json'),
    localMcp: path.join(cwd, '.goose', 'mcp.json'),
    globalSkill: path.join(home, '.config', 'goose', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.goose', 'skills', 'prism', 'SKILL.md')
  },
  {
    id: 'universal',
    name: 'Universal Standard (~/.agents/skills - Zed, Warp, Amp, Replit, Kimi, Loaf)',
    detected: () => fs.existsSync(path.join(home, '.agents', 'skills')),
    globalSkill: path.join(home, '.agents', 'skills', 'prism', 'SKILL.md'),
    localSkill: path.join(cwd, '.agents', 'skills', 'prism', 'SKILL.md')
  }
];

function askQuestion(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function writeMcpConfig(filePath, prismBin) {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    let data = {};
    if (fs.existsSync(filePath)) {
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        data = {};
      }
    }
    if (!data.mcpServers || typeof data.mcpServers !== 'object') {
      data.mcpServers = {};
    }
    data.mcpServers.prism = {
      command: 'node',
      args: [prismBin]
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

function writeSkillFile(targetPath, skillContent) {
  try {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, skillContent);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const installRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const prismBin = path.join(installRoot, 'dist', 'index.js');
  const skillFile = path.join(installRoot, 'skills', 'prism', 'SKILL.md');

  if (!fs.existsSync(prismBin)) {
    console.error('Error: Prism binary not found at ' + prismBin + '. Run "npm run build" first.');
    process.exit(1);
  }

  const skillContent = fs.existsSync(skillFile) ? fs.readFileSync(skillFile, 'utf8') : '';

  let selectedScope = scopeFlag || 'global';
  let selectedAgents = AGENT_DEFINITIONS.filter((a) => a.detected());
  if (selectedAgents.length === 0) {
    selectedAgents = AGENT_DEFINITIONS;
  }

  // Interactive Prompts if TTY
  if (!isNonInteractive) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\nPrism Agent & MCP Configurator');
    console.log('------------------------------');

    // Prompt 1: Scope
    if (!scopeFlag) {
      console.log('\nWhere would you like to install Prism?');
      console.log('  1) Global (system-wide: ~/.agents/skills, ~/.claude.json, etc.) [Default]');
      console.log(`  2) Local Project (current folder: ${cwd})`);
      console.log('  3) Both Global and Local Project');
      const ansScope = (await askQuestion(rl, 'Select scope [1-3, default 1]: ')).trim();
      if (ansScope === '2') selectedScope = 'local';
      else if (ansScope === '3') selectedScope = 'both';
      else selectedScope = 'global';
    }

    // Prompt 2: Agent Selection
    console.log('\nDetected AI Agents on your system:');
    AGENT_DEFINITIONS.forEach((agent, i) => {
      const isDetected = agent.detected();
      const mark = isDetected ? '[✓ DETECTED]' : '[ ]';
      console.log(`  ${(i + 1).toString().padStart(2, ' ')}. ${mark} ${agent.name}`);
    });

    console.log('\nAgent Installation Options:');
    console.log('  [A] All detected agents (recommended)');
    console.log('  [E] Everything (all 70+ supported agents)');
    console.log('  [C] Custom comma-separated numbers (e.g. 1, 2, 4)');
    const ansAgents = (await askQuestion(rl, 'Choose option [A/E/C, default A]: ')).trim().toUpperCase();

    if (ansAgents === 'E') {
      selectedAgents = AGENT_DEFINITIONS;
    } else if (ansAgents === 'C') {
      const nums = (await askQuestion(rl, 'Enter agent numbers to configure: '))
        .split(',')
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((n) => n >= 0 && n < AGENT_DEFINITIONS.length);
      if (nums.length > 0) {
        selectedAgents = nums.map((n) => AGENT_DEFINITIONS[n]);
      }
    }

    rl.close();
  }

  console.log(`\nConfiguring Prism [Scope: ${selectedScope.toUpperCase()}]...`);

  let mcpCount = 0;
  let skillCount = 0;

  for (const agent of selectedAgents) {
    // 1. Global MCP
    if ((selectedScope === 'global' || selectedScope === 'both') && agent.globalMcp) {
      if (writeMcpConfig(agent.globalMcp, prismBin)) {
        console.log(`  ✓ [MCP Global] ${agent.name} -> ${agent.globalMcp}`);
        mcpCount++;
      }
    }

    // 2. Local MCP
    if ((selectedScope === 'local' || selectedScope === 'both') && agent.localMcp) {
      if (writeMcpConfig(agent.localMcp, prismBin)) {
        console.log(`  ✓ [MCP Local]  ${agent.name} -> ${agent.localMcp}`);
        mcpCount++;
      }
    }

    // 3. Global Skill
    if ((selectedScope === 'global' || selectedScope === 'both') && agent.globalSkill && skillContent) {
      if (writeSkillFile(agent.globalSkill, skillContent)) {
        console.log(`  ✓ [Skill Global] ${agent.name} -> ${agent.globalSkill}`);
        skillCount++;
      }
    }

    // 4. Local Skill
    if ((selectedScope === 'local' || selectedScope === 'both') && agent.localSkill && skillContent) {
      if (writeSkillFile(agent.localSkill, skillContent)) {
        console.log(`  ✓ [Skill Local]  ${agent.name} -> ${agent.localSkill}`);
        skillCount++;
      }
    }
  }

  console.log('\nInstallation complete:');
  console.log(`  • Configured ${mcpCount} MCP endpoints`);
  console.log(`  • Injected ${skillCount} SKILL.md agent specifications`);
  console.log('\nRestart your agents to activate Prism.\n');
}

main().catch((err) => {
  console.error('Configuration error:', err);
  process.exit(1);
});
