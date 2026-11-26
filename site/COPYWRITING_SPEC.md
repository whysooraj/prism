# Prism — Product Copywriting & Structure Specification

This document provides the complete utilitarian, outcome-first content structure for Prism's SSS-tier developer product landing page.

---

## 01. Navigation & Status Pill
- **Brand**: Prism
- **Tagline**: MCP Engine for Coding Agents
- **Status Pill**: `[● OPERATIONAL] Model Context Protocol stdio & SSE ready`
- **Navigation Links**:
  - `Engine` (#engine)
  - `Live Inspector` (#interactive-demo)
  - `Pipeline` (#architecture)
  - `13 Tools` (#tools)
  - `Supported Agents` (#agents)
  - `Quickstart` (#quickstart)
- **Primary CTA**: `GitHub` (External link to `https://github.com/whysooraj/prism`)

---

## 02. Hero Section (5-Second Value Delivery)
- **Category Badge**: `UNIVERSAL MODEL CONTEXT PROTOCOL + AGENT SKILLS SPEC`
- **Headline**: Deterministic web layout inspection and structural codebase intelligence for AI agents.
- **Subheadline**: Stop feeding assistants uncomputed HTML and downscaled screenshots. Prism delivers exact CSS box models, WCAG audits, DOM-to-source mapping, and AST symbol tracing directly into agent context.
- **Terminal Quickstart**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/whysooraj/prism/main/install.sh | bash
  ```
  - *Flags*: `-g -y` (Global install for detected agents) | `-l -y` (Local project install)
- **Engine Metrics**:
  - **13 MCP Tools**: Deterministic web layout and AST codebase manipulation.
  - **70+ AI Frameworks**: Antigravity, Claude Code, Cursor, OpenClaw, Codex, Hermes.
  - **86% Token Reduction**: Surgical line slicing vs full-file context dumps.
  - **Tri-Transport**: stdio, Server-Sent Events (SSE), and REST HTTP.

---

## 03. Live Interactive Inspector Demo Mockup
Visualizing the capabilities of Prism's `/ui` inspector playground:

### Scenario A: Box Model & 2D Spatial Radar
- **Target**: `nav.header-nav`
- **Computed Dimensions**: `1440px × 64px` | Padding: `12px 32px` | Margin: `0px` | Border: `1px solid rgba(255,255,255,0.08)`
- **2D Monospace Radar**:
  ```
  +------------------------------------------------------------------------+
  | [nav.header-nav] width: 1440px | height: 64px                          |
  | [Logo] (x:32, w:110) -------- (gap: 32px) ------- [Links] (x:174, w:420) |
  |                                                   [CTA Button] (x:1280)|
  +------------------------------------------------------------------------+
  ```
- **Diagnostics**:
  - `PASS`: 8pt spatial grid alignment confirmed (64px height, 32px horizontal padding).
  - `PASS`: Touch target envelopes satisfy minimum 44×44px interactive bounds.

### Scenario B: Deterministic WCAG AAA Audit
- **Element**: Action CTA Button
- **Colors**: Foreground `#F4F4F5` on Background `#18181B`
- **Contrast Ratio**: `13.4:1` (Exceeds WCAG AAA threshold of 7.0:1)
- **Typography Scale**: `Geist Mono, 13px, font-weight: 500, line-height: 20px`
- **Defect Matrix**:
  - Text Clipping: 0px overflow detected.
  - Occlusion Collisions: 0 overlapping z-index sibling nodes.

### Scenario C: DOM-to-Source Component Mapping (`find_ui_source`)
- **Query**: `find_ui_source({ selector: 'button.cta-primary', textSnippet: 'Get Started' })`
- **Matched File**: `src/components/HeaderNav.tsx` (Lines 42–51, Confidence: 0.94)
- **Surgical Code Slice**:
  ```tsx
  42 | export function HeaderNav({ onOpenQuickstart }: HeaderNavProps) {
  43 |   return (
  44 |     <nav className="flex items-center justify-between px-8 py-3">
  45 |       <Logo />
  46 |       <div className="flex items-center gap-8">
  47 |         <Button
  48 |           variant="primary"
  49 |           onClick={onOpenQuickstart}
  50 |           className="cta-primary h-9 px-4 text-xs font-mono"
  51 |         >Get Started</Button>
  ```

---

## 04. The Problem: The Low-Signal Context Vacuum
Why standard AI tools fail at frontend design review and codebase modifications:

1. **Web Inspection Deficiencies**:
   - *Raw DOM*: Misses computed CSS values, parent cascades, and actual layout coordinates.
   - *Vision Screenshots*: Downscaling to 1024px blurs subpixel gaps, prevents mathematical WCAG auditing, and cannot identify which element triggers a layout shift.
   - *Prism Fix*: Direct headless Chromium layout tree evaluation delivering real rects, margins, paddings, and vector wireframes.
2. **Codebase Navigation Inefficiencies**:
   - *Full-File Dumps*: Burns thousands of tokens per prompt, saturating attention windows and inducing hallucinations.
   - *Text Grep*: Lacks AST awareness, caller/callee trees, and cannot link rendered DOM back to source files.
   - *Prism Fix*: AST symbol parsing, line-sliced retrieval (`get_file`), and DOM-to-source correlation (`find_ui_source`).

---

## 05. Architecture Pipeline: Tri-Core Engine
- **Layer 1: Protocol Transport (`stdio`, `SSE`, `REST`)**
  Connects to AI agents with zero client modification.
- **Layer 2: Web Inspection Pipeline**
  Headless Chromium driver evaluates box models, WCAG contrast, wireframe SVGs, and spatial ASCII radars.
- **Layer 3: Correlation & Verification Engine**
  `find_ui_source` bridges DOM elements to JSX/TSX source lines; `verify_change` validates regressions before and after edits.
- **Layer 4: AST Repository Pipeline**
  Tree-sitter parser indexes symbols, computes blast radius up to depth 3 with `trace_impact`, and extracts route trees.

---

## 06. The 13 Tools Matrix

### Category 1: Web Inspection & Layout
1. `inspect_website`: Extracts full layout tree, computed box models, design tokens, WCAG contrast audits, and vector wireframe SVGs.
2. `inspect_page`: Inspects the active session app with token-efficient options for continuous agent loops.
3. `capture_screenshots`: Captures dual viewports simultaneously (1440×900 Desktop and 390×844 Mobile).

### Category 2: Source Correlation & Verification
4. `find_ui_source`: Correlates rendered DOM nodes directly to JSX/TSX components and exact line numbers.
5. `verify_change`: Compares layout states before and after code changes to catch visual regressions and layout shifts.
6. `get_context`: Unified token-efficient context combining element bounds, layout defects, source candidates, and blast radius.
7. `connect_project`: Registers local repository path and running application URL to maintain persistent session state.

### Category 3: Codebase & AST Intelligence
8. `index_repository`: Fetches repository, extracts AST symbols, builds file trees, and indexes endpoints.
9. `search_codebase`: Structural AST search for functions, classes, interfaces, and routes.
10. `get_file`: Surgically retrieves line-sliced file snippets with numbered prefixes (e.g. lines 40–75).
11. `trace_symbol`: Traces definitions, importers, re-exports, callers, callees, and route handlers.
12. `trace_impact`: Calculates direct and transitive blast radius (depth ≤ 3), affected routes, and assigns risk scores.
13. `explain_architecture`: Summarizes tech stack, dependencies, entry points, and structural directory taxonomy.

---

## 07. Universal 1-Line Installer & 70+ Agent Compatibility
Supports all agents implementing MCP or the Agent Skills specification:
- **Google DeepMind Antigravity (`agy`)**: `~/.gemini/config/mcp_config.json` + Skill
- **Anthropic Claude Code & Desktop**: `~/.claude.json` + Skill
- **OpenAI Codex CLI & ChatGPT**: `~/.codex/mcp.json` + Universal Skill
- **Anysphere Cursor**: `~/.config/Cursor/User/mcp.json` + Skill
- **OpenClaw**: `~/.openclaw/mcp.json` + Skill
- **Nous Research Hermes**: `~/.hermes/mcp.json` + Skill
- **Roo Code & Cline**: `~/.config/Code/User/mcp.json` + Skill
- **Universal Spec (70+ Agents)**: Replit, Zed, Warp, Devin, Goose, OpenHands in `~/.agents/skills/prism/`

---

## 08. ChatGPT Custom Actions (Mobile & Web)
Access Prism on iOS, Android, and web via OpenAPI 3.0:
1. `npm run start:http`: Starts HTTP server on port 3000 + `/ui` playground.
2. `cloudflared tunnel --url http://localhost:3000`: Exposes secure HTTPS endpoint (or deploy Dockerfile to Fly.io).
3. Import `openapi.json` into ChatGPT GPT Editor under Actions.
4. Prompt ChatGPT on your phone: *"Inspect https://news.ycombinator.com and give me the WCAG contrast breakdown."*

---

## 09. Footer & Open Source CTAs
- **License**: MIT License
- **Author**: Engineered by whysooraj
- **Links**: GitHub Repository, Model Context Protocol, Agent Skills Spec, Inspector UI (`/ui`), OpenAPI Spec (`/openapi.json`)
