import ts from 'typescript';
import type { CodeSymbol, RouteDefinition } from '../types.js';

export interface ReExportDefinition {
  fromModule: string;
  exportedNames: string[];
  filePath: string;
}

export interface FileParseResult {
  filePath: string;
  symbols: CodeSymbol[];
  routes: RouteDefinition[];
  imports: string[];
  reExports?: ReExportDefinition[];
}

export function parseSourceFile(filePath: string, content: string): FileParseResult {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    return parseTypeScriptOrJavaScript(filePath, content);
  }

  if (ext === '.py') {
    return parsePython(filePath, content);
  }

  if (ext === '.go') {
    return parseGo(filePath, content);
  }

  if (ext === '.rs') {
    return parseRust(filePath, content);
  }

  return parseGeneric(filePath, content);
}

/**
 * Robust brace block tracker that correctly counts `{` and `}`
 * ignoring braces inside comments (line and block) and string / rune literals.
 */
export function findBraceBlockEnd(lines: string[], startIdx: number): number {
  let depth = 0;
  let foundFirstBrace = false;
  let inBlockComment = false;
  let inString: string | null = null; // '"', "'", '`'

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;

    // Reset single-line string states across lines (unless backtick raw strings)
    if (inString === '"' || inString === '\'') {
      inString = null;
    }

    while (j < line.length) {
      const char = line[j];
      const next = line[j + 1];

      // 1. Inside block comment /* ... */
      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          j += 2;
          continue;
        }
        j++;
        continue;
      }

      // 2. Inside string literal
      if (inString !== null) {
        if (char === '\\') {
          j += 2;
          continue;
        }
        if (char === inString) {
          inString = null;
          j++;
          continue;
        }
        j++;
        continue;
      }

      // 3. Comments start
      if (char === '/' && next === '/') {
        break; // Line comment: ignore remainder of line
      }
      if (char === '/' && next === '*') {
        inBlockComment = true;
        j += 2;
        continue;
      }

      // 4. Character / rune literals ('c') vs Rust lifetimes ('a, 'static)
      if (char === '\'') {
        if (line[j + 2] === '\'') {
          j += 3; // e.g. 'x' or '{'
          continue;
        }
        if (next === '\\' && (line[j + 3] === '\'' || line[j + 4] === '\'')) {
          j = line[j + 3] === '\'' ? j + 4 : j + 5;
          continue;
        }
        // Lifetime or unmatched single quote: advance past quote
        j++;
        continue;
      }

      // 5. String literals start
      if (char === '"' || char === '`') {
        inString = char;
        j++;
        continue;
      }

      // 6. Braces counting
      if (char === '{') {
        depth++;
        foundFirstBrace = true;
      } else if (char === '}') {
        if (foundFirstBrace) {
          depth--;
          if (depth === 0) {
            return i + 1; // 1-based line number
          }
        }
      }

      j++;
    }

    // Safety threshold: if no brace opened after 40 lines, assume no block
    if (!foundFirstBrace && i - startIdx > 40) {
      return startIdx + 1;
    }
  }

  return foundFirstBrace ? lines.length : startIdx + 1;
}

function extractTsCalls(node: ts.Node): string[] {
  const calls: string[] = [];
  function visitChild(child: ts.Node) {
    if (ts.isCallExpression(child)) {
      if (ts.isIdentifier(child.expression)) {
        calls.push(child.expression.text);
      } else if (ts.isPropertyAccessExpression(child.expression)) {
        calls.push(child.expression.name.text);
      }
    }
    ts.forEachChild(child, visitChild);
  }
  ts.forEachChild(node, visitChild);
  return Array.from(new Set(calls));
}

function parseTypeScriptOrJavaScript(filePath: string, content: string): FileParseResult {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const symbols: CodeSymbol[] = [];
  const routes: RouteDefinition[] = [];
  const imports: string[] = [];
  const reExports: ReExportDefinition[] = [];

  function getLine(pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function hasExportModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  function visit(node: ts.Node) {
    // 1. Imports
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        if (!imports.includes(spec)) {
          imports.push(spec);
        }
      }
    }

    // 1.5 Re-exports (export * from './m' or export { a, b } from './m')
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const mod = node.moduleSpecifier.text;
        if (!imports.includes(mod)) {
          imports.push(mod);
        }
        let exportedNames: string[] = [];
        if (!node.exportClause) {
          exportedNames = ['*'];
        } else if (ts.isNamedExports(node.exportClause)) {
          exportedNames = node.exportClause.elements.map((el) => el.name.text);
        }
        reExports.push({
          fromModule: mod,
          exportedNames,
          filePath
        });
      }
    }

    // 2. Functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const startLine = getLine(node.getStart());
      const endLine = getLine(node.getEnd());
      const exported = hasExportModifier(node);
      const calls = node.body ? extractTsCalls(node.body) : [];

      // Check Next.js route handlers: GET, POST, PUT, DELETE, PATCH in route.ts/route.js
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(name.toUpperCase()) && filePath.includes('route.')) {
        routes.push({
          method: name.toUpperCase(),
          path: deriveNextJsRoutePath(filePath),
          handler: name,
          file: filePath,
          line: startLine
        });
      }

      symbols.push({
        name,
        kind: 'function',
        filePath,
        startLine,
        endLine,
        exported,
        signature: node.getText(sourceFile).split('{')[0].trim(),
        calls: calls.length > 0 ? calls : undefined
      });
    }

    // 3. Arrow functions / Variable statements
    if (ts.isVariableStatement(node)) {
      const exported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (decl.name && ts.isIdentifier(decl.name)) {
          const varName = decl.name.text;
          const startLine = getLine(decl.getStart());
          const endLine = getLine(decl.getEnd());

          if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            const calls = extractTsCalls(decl.initializer);
            symbols.push({
              name: varName,
              kind: 'function',
              filePath,
              startLine,
              endLine,
              exported,
              signature: `${varName} = ${decl.initializer.getText(sourceFile).split('=>')[0].split('{')[0].trim()}`,
              calls: calls.length > 0 ? calls : undefined
            });
          } else {
            symbols.push({
              name: varName,
              kind: 'variable',
              filePath,
              startLine,
              endLine,
              exported
            });
          }
        }
      }
    }

    // 4. Classes
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const calls = extractTsCalls(node);
      symbols.push({
        name,
        kind: 'class',
        filePath,
        startLine: getLine(node.getStart()),
        endLine: getLine(node.getEnd()),
        exported: hasExportModifier(node),
        calls: calls.length > 0 ? calls : undefined
      });
    }

    // 5. Interfaces
    if (ts.isInterfaceDeclaration(node)) {
      symbols.push({
        name: node.name.text,
        kind: 'interface',
        filePath,
        startLine: getLine(node.getStart()),
        endLine: getLine(node.getEnd()),
        exported: hasExportModifier(node)
      });
    }

    // 6. Type Aliases
    if (ts.isTypeAliasDeclaration(node)) {
      symbols.push({
        name: node.name.text,
        kind: 'type',
        filePath,
        startLine: getLine(node.getStart()),
        endLine: getLine(node.getEnd()),
        exported: hasExportModifier(node)
      });
    }

    // 7. Express / Fastify / Koa Route Calls: app.get('/path', handler)
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const methodName = expr.name.text.toLowerCase();
        if (['get', 'post', 'put', 'delete', 'patch'].includes(methodName) && node.arguments.length >= 2) {
          const firstArg = node.arguments[0];
          if (ts.isStringLiteral(firstArg)) {
            const secondArg = node.arguments[1];
            routes.push({
              method: methodName.toUpperCase(),
              path: firstArg.text,
              handler: secondArg.getText(sourceFile).slice(0, 40),
              file: filePath,
              line: getLine(node.getStart())
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { filePath, symbols, routes, imports, reExports };
}

function deriveNextJsRoutePath(filePath: string): string {
  const match = filePath.match(/(?:app|pages)(.*)\/route\.[jt]sx?$/);
  return match ? match[1] : filePath;
}

const PYTHON_KEYWORDS = new Set([
  'if', 'elif', 'else', 'while', 'for', 'with', 'def', 'class', 'return',
  'yield', 'raise', 'try', 'except', 'finally', 'print', 'len', 'range',
  'str', 'int', 'float', 'bool', 'dict', 'list', 'set', 'tuple', 'isinstance',
  'getattr', 'setattr', 'hasattr', 'super', 'type', 'id', 'open'
]);

function extractPythonCalls(lines: string[], startIdx: number, endIdx: number): string[] {
  const calls = new Set<string>();
  const callRegex = /(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\(/g;
  for (let i = startIdx; i < Math.min(endIdx, lines.length); i++) {
    const line = lines[i];
    const stripped = line.split('#')[0]; // remove comments
    let m;
    while ((m = callRegex.exec(stripped)) !== null) {
      const fnName = m[2];
      if (!PYTHON_KEYWORDS.has(fnName) && !/^\d+$/.test(fnName)) {
        calls.add(fnName);
      }
    }
  }
  return Array.from(calls);
}

function parsePython(filePath: string, content: string): FileParseResult {
  const symbols: CodeSymbol[] = [];
  const routes: RouteDefinition[] = [];
  const imports: string[] = [];
  const reExports: ReExportDefinition[] = [];

  const lines = content.split('\n');
  let pendingDecorators: Array<{ text: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    const lineNum = i + 1;

    // Skip empty lines or pure comment lines (without losing pending decorators)
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    // 1. Decorators
    if (trimmed.startsWith('@')) {
      pendingDecorators.push({ text: trimmed, line: lineNum });
      continue;
    }

    // 2. Imports: single-line or multiline
    // A. "from x import y, z" or "from x import ("
    const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s*(.*)/);
    if (fromMatch) {
      const moduleName = fromMatch[1];
      if (!imports.includes(moduleName)) {
        imports.push(moduleName);
      }

      let importedPart = fromMatch[2].trim();
      let importedItems: string[] = [];

      if (importedPart.startsWith('(')) {
        // Multiline from ... import ( ... )
        importedPart = importedPart.slice(1);
        let j = i;
        let closed = false;
        while (j < lines.length) {
          const l = (j === i ? importedPart : lines[j]).split('#')[0];
          if (l.includes(')')) {
            importedItems.push(...l.split(')')[0].split(','));
            closed = true;
            i = j;
            break;
          }
          importedItems.push(...l.split(','));
          j++;
        }
        if (!closed) i = j;
      } else {
        importedItems = importedPart.split('#')[0].split(',');
      }

      const cleanItems = importedItems.map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      for (const item of cleanItems) {
        const fullSpec = `${moduleName}.${item}`;
        if (!imports.includes(fullSpec)) {
          imports.push(fullSpec);
        }
      }

      // Check if this from-import is a re-export at module top level (no indent)
      if (rawLine.match(/^[^\s]/)) {
        reExports.push({
          fromModule: moduleName,
          exportedNames: cleanItems.includes('*') ? ['*'] : cleanItems,
          filePath
        });
      }

      pendingDecorators = [];
      continue;
    }

    // B. "import x, y as z" or "import ("
    const importMatch = trimmed.match(/^import\s+(.*)/);
    if (importMatch) {
      let importedPart = importMatch[1].trim();
      let importedItems: string[] = [];

      if (importedPart.startsWith('(')) {
        importedPart = importedPart.slice(1);
        let j = i;
        let closed = false;
        while (j < lines.length) {
          const l = (j === i ? importedPart : lines[j]).split('#')[0];
          if (l.includes(')')) {
            importedItems.push(...l.split(')')[0].split(','));
            closed = true;
            i = j;
            break;
          }
          importedItems.push(...l.split(','));
          j++;
        }
        if (!closed) i = j;
      } else {
        importedItems = importedPart.split('#')[0].split(',');
      }

      for (const item of importedItems) {
        const mod = item.trim().split(/\s+as\s+/)[0].trim();
        if (mod && !imports.includes(mod)) {
          imports.push(mod);
        }
      }

      pendingDecorators = [];
      continue;
    }

    // 3. Functions (async or regular), including multiline signatures
    const fnStartMatch = rawLine.match(/^(\s*)(async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
    if (fnStartMatch) {
      const baseIndent = fnStartMatch[1].length;
      const isAsync = !!fnStartMatch[2];
      const fnName = fnStartMatch[3];
      const fnStartLine = pendingDecorators.length > 0 ? pendingDecorators[0].line : lineNum;

      // Scan full multiline signature until colon ':' at end of header
      let sigLines = [trimmed];
      let lastSigIdx = i;
      let headerClosed = /:\s*(?:#.*)?$/.test(trimmed);

      while (!headerClosed && lastSigIdx + 1 < lines.length) {
        lastSigIdx++;
        const nextL = lines[lastSigIdx].trim();
        sigLines.push(nextL);
        if (/:\s*(?:#.*)?$/.test(nextL)) {
          headerClosed = true;
          break;
        }
      }

      const fullSig = sigLines.join(' ').replace(/\s+/g, ' ').replace(/:\s*$/, '').trim();
      const endLine = findIndentedBlockEnd(lines, lastSigIdx, baseIndent);
      const calls = extractPythonCalls(lines, lastSigIdx + 1, endLine);

      // Check route decorators: @app.get("/path"), @router.post("/path")
      for (const dec of pendingDecorators) {
        const routeMatch = dec.text.match(/@(?:app|router|blueprint|api_router)\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/i);
        if (routeMatch) {
          routes.push({
            method: routeMatch[1].toUpperCase(),
            path: routeMatch[2],
            handler: fnName,
            file: filePath,
            line: dec.line
          });
        }
      }

      symbols.push({
        name: fnName,
        kind: baseIndent > 0 ? 'method' : 'function',
        filePath,
        startLine: fnStartLine,
        endLine,
        signature: fullSig,
        exported: !fnName.startsWith('_'),
        calls: calls.length > 0 ? calls : undefined
      });

      i = lastSigIdx;
      pendingDecorators = [];
      continue;
    }

    // 4. Classes with inheritance and multiline headers
    const classStartMatch = rawLine.match(/^(\s*)class\s+([a-zA-Z0-9_]+)/);
    if (classStartMatch) {
      const baseIndent = classStartMatch[1].length;
      const className = classStartMatch[2];
      const classStartLine = pendingDecorators.length > 0 ? pendingDecorators[0].line : lineNum;

      let sigLines = [trimmed];
      let lastSigIdx = i;
      let headerClosed = /:\s*(?:#.*)?$/.test(trimmed);

      while (!headerClosed && lastSigIdx + 1 < lines.length) {
        lastSigIdx++;
        const nextL = lines[lastSigIdx].trim();
        sigLines.push(nextL);
        if (/:\s*(?:#.*)?$/.test(nextL)) {
          headerClosed = true;
          break;
        }
      }

      const fullSig = sigLines.join(' ').replace(/\s+/g, ' ').replace(/:\s*$/, '').trim();
      const endLine = findIndentedBlockEnd(lines, lastSigIdx, baseIndent);

      symbols.push({
        name: className,
        kind: 'class',
        filePath,
        startLine: classStartLine,
        endLine,
        signature: fullSig,
        exported: !className.startsWith('_')
      });

      i = lastSigIdx;
      pendingDecorators = [];
      continue;
    }

    // If non-matching statement, clear pending decorators
    pendingDecorators = [];
  }

  return { filePath, symbols, routes, imports, reExports };
}

function findIndentedBlockEnd(lines: string[], startIdx: number, baseIndent?: number): number {
  const referenceIndent = baseIndent !== undefined ? baseIndent : (lines[startIdx].match(/^\s*/)?.[0].length || 0);
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trim().startsWith('#')) continue;
    const currentIndent = line.match(/^\s*/)?.[0].length || 0;
    if (currentIndent <= referenceIndent) {
      return i;
    }
  }
  return lines.length;
}

const GO_KEYWORDS = new Set([
  'if', 'for', 'switch', 'case', 'select', 'return', 'go', 'defer',
  'func', 'make', 'new', 'len', 'cap', 'append', 'copy', 'delete',
  'panic', 'recover', 'close', 'range'
]);

function extractGoCalls(lines: string[], startIdx: number, endIdx: number): string[] {
  const calls = new Set<string>();
  const callRegex = /(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\(/g;
  for (let i = startIdx; i < Math.min(endIdx, lines.length); i++) {
    const line = lines[i].split('//')[0];
    let m;
    while ((m = callRegex.exec(line)) !== null) {
      const fn = m[2];
      if (!GO_KEYWORDS.has(fn) && !/^\d+$/.test(fn)) {
        calls.add(fn);
      }
    }
  }
  return Array.from(calls);
}

function parseGo(filePath: string, content: string): FileParseResult {
  const symbols: CodeSymbol[] = [];
  const routes: RouteDefinition[] = [];
  const imports: string[] = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // 1. Imports
    // A. Single import: import "fmt" or import chi "github.com/go-chi/chi"
    const singleImportMatch = trimmed.match(/^import\s+(?:([a-zA-Z0-9_.]+)\s+)?["']([^"']+)["']/);
    if (singleImportMatch) {
      imports.push(singleImportMatch[2]);
      continue;
    }

    // B. Multiline import block: import ( ... )
    if (/^import\s*\(/.test(trimmed)) {
      let j = i + 1;
      while (j < lines.length) {
        const impLine = lines[j].trim();
        if (impLine === ')') {
          i = j;
          break;
        }
        const itemMatch = impLine.match(/(?:([a-zA-Z0-9_.]+)\s+)?["']([^"']+)["']/);
        if (itemMatch) {
          imports.push(itemMatch[2]);
        }
        j++;
      }
      continue;
    }

    // 2. Functions & Methods: func (r *Repo) FunctionName(...) ...
    const fnMatch = line.match(/^func\s+(?:\(([^)]+)\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
    if (fnMatch) {
      const receiver = fnMatch[1]?.trim();
      const name = fnMatch[2];
      const isMethod = !!receiver;

      // Extract full multiline signature until '{'
      let sigLines = [trimmed];
      let j = i;
      let hasBrace = trimmed.includes('{');
      while (!hasBrace && j + 1 < lines.length) {
        j++;
        const nextL = lines[j].trim();
        sigLines.push(nextL);
        if (nextL.includes('{')) {
          hasBrace = true;
          break;
        }
      }

      const fullSig = sigLines.join(' ').split('{')[0].replace(/\s+/g, ' ').trim();
      const endLine = findBraceBlockEnd(lines, i);
      const calls = extractGoCalls(lines, i + 1, endLine);

      symbols.push({
        name,
        kind: isMethod ? 'method' : 'function',
        filePath,
        startLine: lineNum,
        endLine,
        signature: fullSig,
        exported: name[0] === name[0].toUpperCase(),
        calls: calls.length > 0 ? calls : undefined
      });

      continue;
    }

    // 3. Types / Structs / Interfaces
    const typeMatch = line.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
    if (typeMatch) {
      const name = typeMatch[1];
      const kind = typeMatch[2] === 'interface' ? 'interface' : 'class';
      const endLine = findBraceBlockEnd(lines, i);

      symbols.push({
        name,
        kind,
        filePath,
        startLine: lineNum,
        endLine,
        signature: trimmed.split('{')[0].trim(),
        exported: name[0] === name[0].toUpperCase()
      });
      continue;
    }

    // 4. Gin / Mux / Chi routes: r.GET("/path", handler) or router.POST("/path", handler)
    const routeMatch = line.match(/\.(GET|POST|PUT|DELETE|PATCH)\(\s*["']([^"']+)["'],\s*([a-zA-Z0-9_.]+)/);
    if (routeMatch) {
      routes.push({
        method: routeMatch[1],
        path: routeMatch[2],
        handler: routeMatch[3],
        file: filePath,
        line: lineNum
      });
    }
  }

  return { filePath, symbols, routes, imports };
}

const RUST_KEYWORDS = new Set([
  'if', 'for', 'while', 'match', 'loop', 'return', 'fn', 'let', 'mut',
  'pub', 'struct', 'enum', 'impl', 'trait', 'type', 'use', 'mod', 'crate',
  'super', 'self', 'Self', 'Some', 'None', 'Ok', 'Err'
]);

function extractRustCalls(lines: string[], startIdx: number, endIdx: number): string[] {
  const calls = new Set<string>();
  const callRegex = /(?:([a-zA-Z0-9_]+)::)?(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*(?:\(|!)/g;
  for (let i = startIdx; i < Math.min(endIdx, lines.length); i++) {
    const line = lines[i].split('//')[0];
    let m;
    while ((m = callRegex.exec(line)) !== null) {
      const fn = m[3];
      if (!RUST_KEYWORDS.has(fn) && !/^\d+$/.test(fn)) {
        calls.add(fn);
      }
    }
  }
  return Array.from(calls);
}

function parseRust(filePath: string, content: string): FileParseResult {
  const symbols: CodeSymbol[] = [];
  const routes: RouteDefinition[] = [];
  const imports: string[] = [];
  const reExports: ReExportDefinition[] = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      continue;
    }

    // 1. Imports & re-exports: use crate::...; pub use std::...;
    const useMatch = trimmed.match(/^(pub\s+)?use\s+([^;]+);/);
    if (useMatch) {
      const isExported = !!useMatch[1];
      const usePath = useMatch[2].replace(/\s+/g, ' ').trim();
      imports.push(usePath);

      if (isExported) {
        // e.g. pub use crate::auth::AuthService; or pub use crate::auth::*;
        const parts = usePath.split('::');
        const lastPart = parts[parts.length - 1];
        reExports.push({
          fromModule: parts.slice(0, -1).join('::'),
          exportedNames: lastPart.includes('{')
            ? lastPart.replace(/[{}]/g, '').split(',').map((s) => s.trim())
            : [lastPart],
          filePath
        });
      }
      continue;
    }

    // 2. Functions: pub async fn name(...) ...
    const fnMatch = line.match(/^\s*(pub(?:\([^)]+\))?\s+)?(?:async\s+|const\s+|unsafe\s+|extern\s+"[^"]*"\s+)*fn\s+([a-zA-Z0-9_]+)/);
    if (fnMatch) {
      const exported = !!fnMatch[1];
      const name = fnMatch[2];

      // Multiline signature extraction until '{' or ';'
      let sigLines = [trimmed];
      let j = i;
      let hasTerminal = trimmed.includes('{') || trimmed.includes(';');
      while (!hasTerminal && j + 1 < lines.length) {
        j++;
        const nextL = lines[j].trim();
        sigLines.push(nextL);
        if (nextL.includes('{') || nextL.includes(';')) {
          hasTerminal = true;
          break;
        }
      }

      const fullSig = sigLines.join(' ').split('{')[0].replace(/;\s*$/, '').replace(/\s+/g, ' ').trim();
      const endLine = trimmed.includes(';') && !trimmed.includes('{') ? lineNum : findBraceBlockEnd(lines, i);
      const calls = extractRustCalls(lines, i + 1, endLine);

      symbols.push({
        name,
        kind: 'function',
        filePath,
        startLine: lineNum,
        endLine,
        signature: fullSig,
        exported,
        calls: calls.length > 0 ? calls : undefined
      });
      continue;
    }

    // 3. Structs, Traits, Enums
    const declMatch = line.match(/^\s*(pub(?:\([^)]+\))?\s+)?(struct|trait|enum)\s+([a-zA-Z0-9_]+)/);
    if (declMatch) {
      const exported = !!declMatch[1];
      const kindType = declMatch[2];
      const name = declMatch[3];
      const kind = kindType === 'trait' ? 'interface' : kindType === 'enum' ? 'type' : 'class';

      let sigLines = [trimmed];
      let j = i;
      let hasTerminal = trimmed.includes('{') || trimmed.includes(';');
      while (!hasTerminal && j + 1 < lines.length) {
        j++;
        const nextL = lines[j].trim();
        sigLines.push(nextL);
        if (nextL.includes('{') || nextL.includes(';')) {
          hasTerminal = true;
          break;
        }
      }

      const fullSig = sigLines.join(' ').split('{')[0].replace(/;\s*$/, '').replace(/\s+/g, ' ').trim();
      const endLine = trimmed.includes(';') && !trimmed.includes('{') ? lineNum : findBraceBlockEnd(lines, i);

      symbols.push({
        name,
        kind,
        filePath,
        startLine: lineNum,
        endLine,
        signature: fullSig,
        exported
      });
      continue;
    }

    // 4. Impl blocks: impl Service { ... } or impl Trait for Service { ... }
    const implMatch = line.match(/^\s*impl(?:<[^>]+>)?\s+(?:([a-zA-Z0-9_:]+)\s+for\s+)?([a-zA-Z0-9_:]+)/);
    if (implMatch) {
      const traitName = implMatch[1];
      const targetName = implMatch[2];
      const name = traitName ? `${traitName} for ${targetName}` : `impl ${targetName}`;
      const endLine = findBraceBlockEnd(lines, i);

      symbols.push({
        name,
        kind: 'class',
        filePath,
        startLine: lineNum,
        endLine,
        signature: trimmed.split('{')[0].trim(),
        exported: true
      });
      continue;
    }

    // 5. Actix / Axum routes: #[get("/path")] or .route("/path", get(handler))
    const routeAttr = line.match(/#\[(get|post|put|delete|patch)\(\s*["']([^"']+)["']\s*\)\]/i);
    if (routeAttr) {
      const nextLine = lines[i + 1] || '';
      const fnName = nextLine.match(/fn\s+([a-zA-Z0-9_]+)/)?.[1] || 'handler';
      routes.push({
        method: routeAttr[1].toUpperCase(),
        path: routeAttr[2],
        handler: fnName,
        file: filePath,
        line: lineNum
      });
    }
  }

  return { filePath, symbols, routes, imports, reExports };
}

function parseGeneric(filePath: string, content: string): FileParseResult {
  const symbols: CodeSymbol[] = [];
  const routes: RouteDefinition[] = [];
  const imports: string[] = [];

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/(?:function|def|class|interface)\s+([a-zA-Z0-9_]+)/);
    if (match) {
      const endLine = findBraceBlockEnd(lines, i);
      symbols.push({
        name: match[1],
        kind: 'function',
        filePath,
        startLine: i + 1,
        endLine,
        exported: true
      });
    }
  }

  return { filePath, symbols, routes, imports };
}
