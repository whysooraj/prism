<p align="center">
  <img src="assets/logo.svg" alt="Prism Logo" width="100%" />
</p>

# Prism

Deterministic web layout inspection and structural repository intelligence engine for AI coding agents via Model Context Protocol (MCP).

## Overview

AI assistants typically fail at inspecting web applications and foreign codebases because they are fed low-signal representations:
1. **Websites**: Assistants receive either 50KB of uncomputed HTML or blurry downsampled screenshots where exact padding, alignment drift, WCAG contrast violations, and touch target flaws cannot be measured.
2. **Repositories**: Assistants either dump whole files into context (saturating tokens) or use dumb string grep, missing AST hierarchies, call graphs, middleware pipelines, and cross-file dependencies.

Prism decomposes web URLs and Git repositories into deterministic, structured context:
- **Web**: Exact CSS box model (`padding`, `margin`, `rect`), computed typography & color tokens, WCAG contrast audit, 4/8pt spacing validation, and vector wireframe SVGs.
- **Code**: Ephemeral shallow repository acquisition, AST symbol parsing, caller/callee tracing, route mapping, and line-sliced retrieval.

## Architecture

```
[ AI Assistant (Claude / Antigravity / Cursor / ChatGPT) ]
                            │
               MCP (JSON-RPC via stdio / SSE)
                            │
                            ▼
                    [ PRISM ENGINE ]
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
   [ Web Pipeline ]                    [ Repo Pipeline ]
  • Playwright Chromium Engine        • Git Acquisition (--depth 1)
  • Box Model & Layout Tree           • AST Compiler (TS/JS/Py/Go/Rs)
  • Design Token Extractor            • Symbol Indexer & Call Graph
  • WCAG Contrast Auditor             • Route & Middleware Analyzer
  • Deterministic Wireframe SVG       • Surgical Line Slicer
  • SSRF Safety Boundary              • Memory Cache
```

## Tools Reference

| Tool | Parameters | Output | Description |
|---|---|---|---|
| `inspect_website` | `url`: string<br>`viewport?`: `{ width, height }`<br>`includeWireframeSvg?`: boolean<br>`includeA11y?`: boolean<br>`allowLocalhost?`: boolean | JSON (`WebInspectionResult`) | Extracts layout tree, box model, design tokens, WCAG contrast score, and wireframe SVG |
| `capture_screenshots` | `url`: string<br>`allowLocalhost?`: boolean | PNG Base64 (Desktop & Mobile) | Captures dual viewports (1440x900 and 390x844) |
| `index_repository` | `urlOrPath`: string<br>`branch?`: string<br>`authToken?`: string | JSON (`RepoIndexSummary`) | Fetches repo, extracts AST symbols, builds file tree and routes |
| `search_codebase` | `query`: string<br>`kind?`: `function\|class\|route...`<br>`limit?`: number | JSON (`CodeSymbol[]`) | Searches symbols and endpoints with AST relevance scoring |
| `get_file` | `filePath`: string<br>`startLine?`: number<br>`endLine?`: number | Formatted text with line numbers | Retrieves exact lines with line number prefix (`42 \| code`) |
| `trace_symbol` | `symbolName`: string | JSON (`SymbolTrace`) | Traces definitions, importers, and connected HTTP route handlers |
| `explain_architecture` | None | JSON (`ArchitectureSummary`) | Summarizes tech stack, key configs, entry points, and directory map |

## Getting Started

### Prerequisites
- Node.js >= 20.0.0
- Google Chrome or Chromium installed on the host machine (`/usr/bin/google-chrome-stable` or `chromium`)
- Git >= 2.30

### Installation
```bash
git clone https://github.com/whysooraj/prism.git
cd prism
npm install
npm run build
```

### Self-Check Suite
Prism includes an assert-based test suite that validates SSRF boundaries, Playwright DOM parsing, and AST symbol indexing:
```bash
npm test
```

## Client Configuration

### Claude Code (`~/.claude.json`)
```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/absolute/path/to/prism/dist/index.js"]
    }
  }
}
```

### Claude Desktop / Cursor (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/absolute/path/to/prism/dist/index.js"]
    }
  }
}
```

### Antigravity / Gemini CLI (`~/.gemini/config/mcp_config.json`)
```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/absolute/path/to/prism/dist/index.js"]
    }
  }
}
```

## Security Model

- **SSRF Hardening**: By default, `inspect_website` intercepts and aborts requests to private IPv4/IPv6 subnets (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `::1`) and local hostnames (`localhost`, `*.local`, `*.internal`).
- **Browser Sandboxing**: Runs headless Chromium with isolated incognito contexts that terminate immediately upon evaluation completion.
- **Controlled Ingestion**: Repositories are cloned shallowly with depth 1 into isolated user cache directories (`~/.cache/context-bridge/repos/`) and never shared across unauthorized boundaries.

## License

MIT
