---
name: prism
description: Deterministic web layout inspection and structural repository intelligence via Model Context Protocol (MCP). Use when analyzing website designs, checking WCAG contrast, measuring box-model layout metrics, or exploring foreign GitHub repositories with AST symbol tracing.
---

# Prism Agent Skill

Prism gives AI agents deterministic mathematical inspection of websites and structural AST intelligence for codebases.

## When to Use Prism

### 1. Web Inspection & UI/UX Design Audit
Trigger when asked to:
- "Review my website design"
- "Audit accessibility / WCAG contrast"
- "Check if my landing page has layout bugs"
- "Inspect responsive layout and touch targets"
- "Generate a wireframe of this website"

**Tool**: `inspect_website(url: "https://example.com")`
- **Box Model**: Returns exact `padding`, `margin`, `border`, and bounding rects.
- **Design Tokens**: Returns deduplicated palette entries and typography scale tokens.
- **Audit Score (0-100)**: Automatically calculates deductions for:
  - Text failing WCAG AA (4.5:1 contrast ratio)
  - Spacing values that deviate from 4/8pt grid (e.g., 13px, 19px)
  - Touch targets smaller than 44x44px
  - Horizontal viewport overflow (`scrollWidth > clientWidth`)
  - Generic AI design tropes (purple gradients, ungrounded glassmorphism, card soup)
- **Vector Wireframe**: Returns clean SVG layout schematic.

### 2. Remote GitHub Codebase Exploration
Trigger when asked:
- "How does auth/billing/routing work in `github.com/user/repo`?"
- "Trace this function or symbol across the project"
- "Explain architecture of this repository"

**Step 1: Index Repository**
```
index_repository(urlOrPath: "https://github.com/owner/repo")
```
Clones repository shallowly (`--depth 1`), parses AST symbols (TS/JS/Py/Go/Rs), discovers HTTP routes, and indexes symbols in memory.

**Step 2: Structural Symbol Search**
```
search_codebase(query: "verifyToken", kind: "function")
```
Searches functions, classes, interfaces, or routes without scanning every file.

**Step 3: Trace Cross-File Relationships**
```
trace_symbol(symbolName: "verifyToken")
```
Reveals where the symbol is defined, which files import it, and which HTTP endpoints call it.

**Step 4: Surgical Line Retrieval**
```
get_file(filePath: "src/auth/service.ts", startLine: 40, endLine: 75)
```
Retrieves only the relevant implementation slice formatted with line numbers, saving >90% context tokens compared to reading the whole file.

## Best Practices
- Never dump whole files into context when a 30-line slice from `get_file` contains the full answer.
- Trust the mathematical contrast ratio and spacing grid measurements from `inspect_website` over screenshot vision guessing.
