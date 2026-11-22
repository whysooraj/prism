<p align="center">
  <img src="assets/logo.svg" alt="Prism Logo" width="100%" />
</p>

# Prism

Deterministic web layout inspection and structural repository intelligence engine for AI coding agents via Model Context Protocol (MCP).

<p align="center">
  <a href="#supported-ai-agents--ecosystem"><img src="https://img.shields.io/badge/Google_DeepMind-Antigravity-4285F4?style=flat-square&logo=google&logoColor=white" alt="Google DeepMind Antigravity" /></a>
  <a href="#supported-ai-agents--ecosystem"><img src="https://img.shields.io/badge/Anthropic-Claude_Code-D97706?style=flat-square&logo=anthropic&logoColor=white" alt="Anthropic Claude" /></a>
  <a href="#supported-ai-agents--ecosystem"><img src="https://img.shields.io/badge/OpenAI-Codex_&_ChatGPT-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI Codex" /></a>
  <a href="#supported-ai-agents--ecosystem"><img src="https://img.shields.io/badge/Anysphere-Cursor-000000?style=flat-square&logo=cursor&logoColor=white" alt="Cursor" /></a>
  <a href="#supported-ai-agents--ecosystem"><img src="https://img.shields.io/badge/OpenClaw-Supported-10B981?style=flat-square&logo=gnubash&logoColor=white" alt="OpenClaw" /></a>
  <a href="#supported-ai-agents--ecosystem"><img src="https://img.shields.io/badge/Nous_Research-Hermes_Agent-6366F1?style=flat-square&logo=probot&logoColor=white" alt="Hermes Agent" /></a>
  <a href="#supported-ai-agents--ecosystem"><img src="https://img.shields.io/badge/GitHub-Copilot_CLI-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub Copilot" /></a>
  <a href="#supported-ai-agents--ecosystem"><img src="https://img.shields.io/badge/Microsoft-VS_Code_/_Cline-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white" alt="VS Code Cline" /></a>
</p>

## Quickstart (One-Line Universal Installer)

Install Prism with an interactive agent & scope selector (Global vs Local Project):

```bash
curl -fsSL https://raw.githubusercontent.com/whysooraj/prism/main/install.sh | bash
```

The installer prompts you:
1. **Scope Selection**:
   - **Global** (system-wide: `~/.agents/skills/`, `~/.claude.json`, `~/.gemini/config/`, etc.)
   - **Local Project** (installs inside the current directory: `./.agents/skills/`, `./.cursor/mcp.json`, etc.)
   - **Both**
2. **Agent Selection**:
   - Auto-detects installed agents on your machine.
   - Lets you choose: **[A]** All detected agents, **[E]** All 70+ supported agents, or **[C]** Custom selection.

### Non-Interactive / CI Flags

```bash
# Install globally for all detected agents non-interactively
curl -fsSL https://raw.githubusercontent.com/whysooraj/prism/main/install.sh | bash -s -- -g -y

# Install locally to current project only
curl -fsSL https://raw.githubusercontent.com/whysooraj/prism/main/install.sh | bash -s -- -l -y
```

---

## The Problem

AI assistants fail at web design inspection and codebase analysis because they operate on low-signal approximations:
1. **Websites**: Assistants receive either uncomputed raw HTML (missing exact CSS computed values) or downscaled screenshots (where padding, alignment drift, WCAG contrast violations, and touch targets cannot be mathematically verified).
2. **Repositories**: Assistants either dump entire files into context (saturating tokens and inducing hallucinations) or rely on naive string grep (which lacks AST symbol understanding, caller/callee graphs, and route definitions).

Prism bridges this gap by providing deterministic, structured context:
- **Web**: Exact CSS box model (`padding`, `margin`, `rect`), computed typography & color tokens, WCAG contrast audit, 4/8pt spacing validation, and vector wireframe SVGs.
- **Code**: Ephemeral shallow repository acquisition, AST symbol parsing, caller/callee tracing, route mapping, and line-sliced retrieval.

---

## Supported AI Agents & Ecosystem

Prism adheres to both the **Model Context Protocol (MCP)** and the open **Agent Skills specification** (`agentskills.io` pioneered by Vercel Labs), supporting 70+ developer agents:

| Agent / Framework | Creator / Organization | Integration Type | Auto-Configured Path |
|---|---|---|---|
| **Antigravity (`agy`)** | Google DeepMind | Native MCP + Skill | `~/.gemini/config/mcp_config.json`<br>`~/.gemini/config/skills/prism/` |
| **OpenClaw** | OpenClaw Community | MCP + Skill | `~/.openclaw/mcp.json`<br>`~/.openclaw/skills/prism/` |
| **Hermes Agent** | Nous Research | MCP + Skill | `~/.hermes/mcp.json`<br>`~/.hermes/skills/prism/` |
| **Claude Code & Desktop** | Anthropic | MCP + Skill | `~/.claude.json`<br>`~/.claude/skills/prism/` |
| **Cursor** | Anysphere | MCP + Skill | `~/.config/Cursor/User/mcp.json`<br>`~/.cursor/skills/prism/` |
| **OpenCode** | OpenCode Project | Native MCP + Universal Skill | `~/.config/opencode/mcp.json` |
| **Pi Agent** | Inflection AI | MCP + Universal Skill | `~/.pi/mcp.json` |
| **Codex CLI** | OpenAI | MCP + Universal Skill | `~/.codex/mcp.json` |
| **Cline & Roo Code** | Roo / Cline Community | MCP + Universal Skill | `~/.config/Code/User/mcp.json`<br>`~/.roo/skills/prism/` |
| **Devin for Terminal** | Cognition AI | MCP + Skill | `~/.config/devin/skills/prism/` |
| **Goose** | Block | MCP + Skill | `~/.config/goose/skills/prism/` |
| **Windsurf** | Codeium | Native MCP | `~/.codeium/windsurf/mcp_config.json` |
| **OpenHands** | All-Hands AI | Universal Skill | `~/.openhands/skills/prism/` |
| **Continue** | Continue Dev | Universal Skill | `~/.continue/skills/prism/` |
| **Universal Agents** | Amp, Replit, Zed, Warp, Loaf, Kimi | Universal Skill | `~/.agents/skills/prism/` |

---

## Architecture

```
[ AI Assistant (agy / claude / cursor / opencode / pi / codex) ]
                               │
                 MCP (JSON-RPC via stdio / SSE)
                               │
                               ▼
                       [ PRISM ENGINE ]
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
      [ Web Pipeline ]    [ Correlation ]   [ Repo Pipeline ]
     • Chromium Engine    • find_ui_source  • Git Acquisition
     • Box Model & Trees  • verify_change   • AST Compiler
     • Design Tokens      • Layout Diffs    • Symbol Indexer
     • WCAG Contrast      • Regressions     • Route Analyzer
     • 2D ASCII Radar     • Shift Scoring   • Surgical Slicer
     • SSRF Boundary                        • Project Registry
```

---

## Tools Reference

| Tool | Parameters | Output | Description |
|---|---|---|---|
| `inspect_website` | `url`: string<br>`viewport?`: `{ width, height }`<br>`includeWireframeSvg?`: boolean<br>`includeA11y?`: boolean<br>`allowLocalhost?`: boolean | JSON (`WebInspectionResult`) | Extracts layout tree, box model, design tokens, WCAG contrast score, and wireframe SVG |
| `capture_screenshots` | `url`: string<br>`allowLocalhost?`: boolean | PNG Base64 (Desktop & Mobile) | Captures dual viewports (1440x900 and 390x844) |
| `find_ui_source` | `projectPath`: string<br>`selector?`: string<br>`tag?`: string<br>`textSnippet?`: string<br>`currentRoute?`: string | JSON (`FindUiSourceResult`) | Maps rendered DOM elements to likely JSX/TSX source components and lines with confidence scoring |
| `verify_change` | `before`: `WebInspectionResult`<br>`after`: `WebInspectionResult`<br>`beforeUrl?`: string<br>`afterUrl?`: string | JSON (`ChangeVerificationResult`) | Compares before/after layout states, detects resolved defects, visual regressions, and layout shifts |
| `index_repository` | `urlOrPath`: string<br>`branch?`: string<br>`authToken?`: string | JSON (`RepoIndexSummary`) | Fetches repo, extracts AST symbols, builds file tree and routes |
| `search_codebase` | `query`: string<br>`kind?`: `function\|class\|route...`<br>`limit?`: number | JSON (`CodeSymbol[]`) | Searches symbols and endpoints with AST relevance scoring |
| `get_file` | `filePath`: string<br>`startLine?`: number<br>`endLine?`: number | Formatted text with line numbers | Retrieves exact lines with line number prefix (`42 \| code`) |
| `trace_symbol` | `symbolName`: string | JSON (`SymbolTrace`) | Traces definitions, importers, re-exports, callers, and connected HTTP route handlers |
| `trace_impact` | `target`: string<br>`repoIdentifier?`: string | JSON (`ImpactAnalysisResult`) | Computes direct and transitive blast radius (up to depth 3), affected routes, and risk score (LOW/MEDIUM/HIGH) |
| `get_context` | `selector?`: string<br>`textSnippet?`: string<br>`tag?`: string<br>`urlOrRoute?`: string<br>`inspectionResult?`: object | JSON (`CompactTaskContext`) | Unified token-efficient context package combining element bounds, layout defects, source candidates, and blast radius |
| `explain_architecture` | None | JSON (`ArchitectureSummary`) | Summarizes tech stack, key configs, entry points, and directory map |

---

## ChatGPT Custom Actions Setup (Mobile & Web)

Prism natively supports ChatGPT Custom Actions so you can inspect live websites and foreign codebases on iOS, Android, and chatgpt.com.

### 1. Run the HTTP Server
Locally via tunnel:
```bash
# Start the HTTP server on port 3000
npm run start:http

# Visit the interactive visual inspector playground in your browser:
# http://localhost:3000/ui

# Expose via free tunnel (e.g. Cloudflare Tunnel or ngrok)
cloudflared tunnel --url http://localhost:3000
# or: ngrok http 3000
```
Or deploy the included `Dockerfile` directly to Fly.io, Railway, or any VPS.

### 2. Interactive Web Inspector Playground

When running in HTTP mode (`prism serve` or `npm run start:http`), Prism serves a visual inspector UI at `http://localhost:3000/ui`. Developers can input any live URL or mock data string to inspect:
- Live Vector Wireframe SVG rendering
- 2D Monospace Spatial Radar
- Deterministic Design Audit scorecard (WCAG contrast, 4/8pt spacing, mobile touch targets, layer occlusion collisions, optical balance asymmetry, text clipping)
- Extracted design tokens (Color palette swatches and typography scale)

### 3. Configure in ChatGPT
1. Go to [ChatGPT GPT Editor](https://chatgpt.com/gpts/editor).
2. Under **Configure**, click **Create new action**.
3. Under **Schema**, paste the contents of [`openapi.json`](openapi.json) (or click "Import from URL" pointing to `https://your-domain.com/openapi.json`).
4. Set Authentication to **None** (or configure API key headers if preferred).
5. Save the GPT.

### 4. Usage on iPhone, Android, & Web
Prompt your Custom GPT from any mobile device:
* *"Inspect https://news.ycombinator.com and give me the WCAG contrast breakdown and layout wireframe."*
* *"How does the routing algorithm work in https://github.com/career-ops-hq/career-ops?"*
ChatGPT automatically calls your hosted Prism endpoints and renders the grounded analysis.

---

## Manual Configuration

If you prefer manual setup rather than the one-line installer:

```bash
git clone https://github.com/whysooraj/prism.git ~/.prism
cd ~/.prism
npm install
npm run build
```

Then add to your client's MCP configuration:

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/home/YOUR_USER/.prism/dist/index.js"]
    }
  }
}
```

---

## Performance & Speed Benchmarks

Benchmarked via `benchmark/speed-benchmark.ts` on Node.js v25 with local headless Chromium:

| Operation | Latency | Prism Tokens | Vision / Full Dump | Token Savings |
| :--- | :--- | :--- | :--- | :--- |
| **SaaS Landing Page** | `564ms` | 1053 | ~1400 (Screenshot VLM) | **25%** |
| **Dense Enterprise Dash** | `403ms` | 604 | ~1400 (Screenshot VLM) | **57%** |
| **AST Repo Index (35 files / 924 symbols)** | `120ms` | 102 (Trace) | ~15,750 (Raw Text Dump) | **99%** |

- **Web Inspection**: ~484ms end-to-end (stabilized via `document.fonts.ready` + animation frame quiet period, DOM extraction, stacking context collisions, alpha composite, 2D ASCII radar).
- **Repo Throughput**: ~290 files/sec via native TypeScript compiler AST.
- **Vision Comparison**: Standard 1440x900 screenshots consume ~1400-1600 tokens on GPT-4o and Claude 3.5. Prism outputs structured box models and 2D ASCII radar in 600-1000 tokens with exact pixel precision and zero OCR hallucinations.

To run the speed benchmark:
```bash
npx tsx benchmark/speed-benchmark.ts
```

---

## Comparison with Existing Solutions

| Capability | Prism (ContextBridge) | VLM Agents (Browserbase, browser-use) | A11y / Text Cleaners (Jina, ariaSnapshot) | Linters (Lighthouse, axe-core) | Repo Packers (Repomix, Gitingest) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Exact CSS Box Model** | Yes (padding, margin, rect) | No (hallucinated pixels) | No (stripped) | Partial (computed audit) | N/A |
| **2D Spatial ASCII Radar** | Yes (80x24 viewport map) | No | No | No | N/A |
| **Vector Wireframe SVG** | Yes (deterministic) | No | No | No | N/A |
| **Layer Occlusion Collision** | Yes (elementFromPoint) | No | No | No | N/A |
| **Hierarchical Alpha Composite** | Yes (exact RGB math) | Visual estimate | No | Limited | N/A |
| **Token Efficiency** | High (600-1000 tokens) | Low (1400-1600 tokens/shot) | High (text-only) | N/A | Very Low (100k+ tokens) |
| **AST Symbol Call Graphs** | Yes (TS/JS/Py/Go/Rs) | No | No | No | No (raw text dump) |
| **Visual-to-Source Correlation** | Yes (`find_ui_source`) | No | No | No | No |
| **Visual Change Verification** | Yes (`verify_change`) | No | No | No | No |
| **ChatGPT Action + MCP Native** | Yes (Dual HTTP & stdio) | Partial | Partial | No | No |

---

## Verification & Testing

Prism comes with a native self-check suite verifying SSRF boundaries, Playwright DOM parsing, and AST symbol extraction:

```bash
npm test
```

### AI UI Readability Benchmark

To measure and verify AI UI comprehension fidelity against mock benchmarks:

```bash
npx tsx benchmark/readability-eval.ts
```

---

## Security Model

- **SSRF Hardening**: By default, `inspect_website` intercepts and aborts requests to private IPv4/IPv6 subnets (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `::1`) and local hostnames (`localhost`, `*.local`, `*.internal`).
- **Browser Sandboxing**: Runs headless Chromium with isolated incognito contexts that terminate immediately upon evaluation completion.
- **Controlled Ingestion**: Repositories are cloned shallowly with depth 1 into isolated user cache directories (`~/.cache/context-bridge/repos/`) and never shared across unauthorized boundaries.

---

## License

MIT
