# ContextBridge

AI context infrastructure providing deterministic web layout inspection and structural repository intelligence via Model Context Protocol (MCP).

## Problem

Giving an AI assistant a URL or Git repository typically yields one of two failure modes:
1. **Websites**: assistants receive raw token-heavy HTML or downsampled screenshot images where layout math, contrast ratios, and alignment defects are invisible.
2. **Repositories**: assistants receive whole-file text dumps or basic vector chunks that strip away AST symbols, call hierarchies, middleware chains, and import graphs.

ContextBridge bridges this gap by extracting structured visual, spatial, and AST context directly into any MCP-compatible AI client.

## Core Capabilities

### 1. Web Layout & Design Intelligence
- **Box Model Extraction**: computes exact padding, margin, border, coordinates, and bounding rectangles.
- **Design Token Discovery**: deduplicates palette swatches, typography scales, and spacing ladders.
- **Mathematical Design Audit**:
  - WCAG AA contrast ratio validation.
  - Spacing grid deviation detection (4/8pt adherence).
  - Mobile touch target compliance (< 44x44px).
  - Horizontal viewport overflow detection (`scrollWidth > clientWidth`).
  - Anti-slop heuristic scan (generic AI gradients, card soup, ungrounded blur).
- **Deterministic Wireframe SVG**: generates an exact vector layout schematic of the page without vision model tokens.
- **SSRF Hardening**: blocks private IP subnets and internal loopback requests by default.

### 2. Repository Ingestion & Symbol Intelligence
- **Fast Repository Acquisition**: clones remote GitHub repositories shallowly (`--depth 1`) or indexes local paths.
- **Language-Aware AST Parsing**: extracts functions, classes, interfaces, types, imports, and exports (TypeScript, JavaScript, Python, Go, Rust).
- **Route & Middleware Extraction**: detects HTTP handlers across Express, Fastify, Next.js App Router, FastAPI, Flask, and Gin.
- **Surgical Code Retrieval**: serves exact line slices with line numbers for grounded context retrieval.
- **Symbol Tracing**: identifies symbol definitions, call sites, and referencing modules across the codebase.

## Exposed MCP Tools

| Tool | Parameters | Description |
|---|---|---|
| `inspect_website` | `url`, `viewport?`, `includeWireframeSvg?`, `includeA11y?`, `allowLocalhost?` | Inspects DOM layout tree, box model, design tokens, and audit score |
| `capture_screenshots` | `url`, `allowLocalhost?` | Captures desktop (1440x900) and mobile (390x844) PNG screenshots |
| `index_repository` | `urlOrPath`, `branch?`, `authToken?` | Clones and indexes AST symbols, routes, and configs |
| `search_codebase` | `query`, `kind?`, `limit?` | Searches indexed symbols and routes with relevance scoring |
| `get_file` | `filePath`, `startLine?`, `endLine?` | Retrieves file contents with line-number prefixes |
| `trace_symbol` | `symbolName` | Traces definitions, importers, and connected routes |
| `explain_architecture` | None | Produces high-level architecture, entry points, and directory map |

## Installation & Setup

### Prerequisites
- Node.js >= 20
- Google Chrome or Chromium installed on the host system

### Build
```bash
git clone <repo-url> context-bridge
cd context-bridge
npm install
npm run build
```

### Run Self-Checks
```bash
npm test
```

## MCP Client Configuration

### Claude Code
Add to `~/.claude.json` or project MCP configuration:
```json
{
  "mcpServers": {
    "context-bridge": {
      "command": "node",
      "args": ["/home/whysooraj/Projects/context-bridge/dist/index.js"]
    }
  }
}
```

### Claude Desktop / Cursor
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "context-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/context-bridge/dist/index.js"]
    }
  }
}
```

## Security Model

1. **Browser Isolation**: Each `inspect_website` call runs in an isolated ephemeral incognito context.
2. **SSRF Guard**: Resolves and intercepts outbound requests to prevent targeting loopback interfaces (`127.0.0.1`, `localhost`) and private RFC-1918/link-local address spaces (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`).
3. **Repository Quarantine**: Cloned repositories are isolated in `~/.cache/context-bridge/repos/` with shallow depth.
