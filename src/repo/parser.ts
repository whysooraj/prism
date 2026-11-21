import ts from 'typescript';
import type { CodeSymbol, RouteDefinition } from '../types.js';

export interface FileParseResult {
  filePath: string;
  symbols: CodeSymbol[];
  routes: RouteDefinition[];
  imports: string[];
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
        imports.push(node.moduleSpecifier.text);
      }
    }

    // 2. Functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const startLine = getLine(node.getStart());
      const endLine = getLine(node.getEnd());
      const exported = hasExportModifier(node);

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
        signature: node.getText(sourceFile).split('{')[0].trim()
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
            symbols.push({
              name: varName,
              kind: 'function',
              filePath,
              startLine,
              endLine,
              exported,
              signature: `${varName} = ${decl.initializer.getText(sourceFile).split('=>')[0].split('{')[0].trim()}`
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
      symbols.push({
        name,
        kind: 'class',
        filePath,
        startLine: getLine(node.getStart()),
        endLine: getLine(node.getEnd()),
        exported: hasExportModifier(node)
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

  return { filePath, symbols, routes, imports };
}

function deriveNextJsRoutePath(filePath: string): string {
  // src/app/api/auth/[id]/route.ts -> /api/auth/[id]
  const match = filePath.match(/(?:app|pages)(.*)\/route\.[jt]sx?$/);
  return match ? match[1] : filePath;
}

function parsePython(filePath: string, content: string): FileParseResult {
  const symbols: CodeSymbol[] = [];
  const routes: RouteDefinition[] = [];
  const imports: string[] = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Imports
    const importMatch = line.match(/^\s*(?:from\s+([a-zA-Z0-9_.]+)\s+import|import\s+([a-zA-Z0-9_.]+))/);
    if (importMatch) {
      imports.push(importMatch[1] || importMatch[2]);
    }

    // Functions
    const fnMatch = line.match(/^\s*(async\s+)?def\s+([a-zA-Z0-9_]+)\s*\((.*?)\):/);
    if (fnMatch) {
      const name = fnMatch[2];
      symbols.push({
        name,
        kind: 'function',
        filePath,
        startLine: lineNum,
        endLine: findIndentedBlockEnd(lines, i),
        signature: `def ${name}(${fnMatch[3]})`,
        exported: !name.startsWith('_')
      });
    }

    // Classes
    const classMatch = line.match(/^\s*class\s+([a-zA-Z0-9_]+)(?:\((.*?)\))?:/);
    if (classMatch) {
      const name = classMatch[1];
      symbols.push({
        name,
        kind: 'class',
        filePath,
        startLine: lineNum,
        endLine: findIndentedBlockEnd(lines, i),
        signature: `class ${name}${classMatch[2] ? `(${classMatch[2]})` : ''}`,
        exported: !name.startsWith('_')
      });
    }

    // FastAPI / Flask Route decorators: @app.get("/path")
    const routeMatch = line.match(/@(?:app|router)\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/i);
    if (routeMatch) {
      const nextLine = lines[i + 1] || '';
      const handlerMatch = nextLine.match(/def\s+([a-zA-Z0-9_]+)/);
      routes.push({
        method: routeMatch[1].toUpperCase(),
        path: routeMatch[2],
        handler: handlerMatch ? handlerMatch[1] : 'handler',
        file: filePath,
        line: lineNum
      });
    }
  }

  return { filePath, symbols, routes, imports };
}

function parseGo(filePath: string, content: string): FileParseResult {
  const symbols: CodeSymbol[] = [];
  const routes: RouteDefinition[] = [];
  const imports: string[] = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Functions: func (r *Repo) FunctionName(...)
    const fnMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
    if (fnMatch) {
      const name = fnMatch[1];
      symbols.push({
        name,
        kind: 'function',
        filePath,
        startLine: lineNum,
        endLine: lineNum + 10,
        exported: name[0] === name[0].toUpperCase()
      });
    }

    // Types / Structs
    const typeMatch = line.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
    if (typeMatch) {
      symbols.push({
        name: typeMatch[1],
        kind: typeMatch[2] === 'interface' ? 'interface' : 'class',
        filePath,
        startLine: lineNum,
        endLine: lineNum + 10,
        exported: typeMatch[1][0] === typeMatch[1][0].toUpperCase()
      });
    }

    // Gin / Mux routes
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

function parseRust(filePath: string, content: string): FileParseResult {
  const symbols: CodeSymbol[] = [];
  const routes: RouteDefinition[] = [];
  const imports: string[] = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Functions: pub fn name(...)
    const fnMatch = line.match(/^\s*(pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/);
    if (fnMatch) {
      symbols.push({
        name: fnMatch[2],
        kind: 'function',
        filePath,
        startLine: lineNum,
        endLine: lineNum + 10,
        exported: !!fnMatch[1]
      });
    }

    // Structs / Traits / Enums
    const structMatch = line.match(/^\s*(pub\s+)?(struct|trait|enum)\s+([a-zA-Z0-9_]+)/);
    if (structMatch) {
      symbols.push({
        name: structMatch[3],
        kind: structMatch[2] === 'trait' ? 'interface' : 'class',
        filePath,
        startLine: lineNum,
        endLine: lineNum + 10,
        exported: !!structMatch[1]
      });
    }
  }

  return { filePath, symbols, routes, imports };
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
      symbols.push({
        name: match[1],
        kind: 'function',
        filePath,
        startLine: i + 1,
        endLine: i + 10,
        exported: true
      });
    }
  }

  return { filePath, symbols, routes, imports };
}

function findIndentedBlockEnd(lines: string[], startIdx: number): number {
  const startIndent = lines[startIdx].match(/^\s*/)?.[0].length || 0;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const currentIndent = line.match(/^\s*/)?.[0].length || 0;
    if (currentIndent <= startIndent) {
      return i;
    }
  }
  return lines.length;
}
