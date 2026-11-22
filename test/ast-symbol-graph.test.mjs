import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findBraceBlockEnd,
  parseSourceFile
} from '../dist/repo/parser.js';
import { RepositoryIndexManager } from '../dist/repo/symbol-index.js';

test('AST: findBraceBlockEnd robust brace block tracking', () => {
  const code = [
    'func (s *Service) DoWork() error {',       // 1
    '    // line comment with { and }',          // 2
    '    /* multiline block',                    // 3
    '       comment with { and } */',            // 4
    '    str := "string with { and }";',         // 5
    '    raw := `raw with',                      // 6
    '       { braces }`;',                       // 7
    '    charLit := \'{\';',                     // 8
    '    if true {',                             // 9
    '        return nil;',                       // 10
    '    }',                                     // 11
    '}'                                          // 12
  ];

  const endLine = findBraceBlockEnd(code, 0);
  assert.equal(endLine, 12, 'Should match line 12 as closing brace of DoWork');

  // Rust lifetime edge case: 'a must not be treated as an unclosed string quote
  const rustCode = [
    'impl<\'a> Service<\'a> {',                  // 1
    '    pub fn process(&\'a self) -> &\'a str {', // 2
    '        let ch = \'{\';',                   // 3
    '        "done"',                            // 4
    '    }',                                     // 5
    '}'                                          // 6
  ];

  const rustImplEnd = findBraceBlockEnd(rustCode, 0);
  assert.equal(rustImplEnd, 6, 'Rust impl block should close at line 6 despite lifetimes');

  const rustFnEnd = findBraceBlockEnd(rustCode, 1);
  assert.equal(rustFnEnd, 5, 'Rust fn should close at line 5');

  // Multiline signature with opening brace on line 3
  const multilineSig = [
    'func LongSignature(',                       // 1
    '    a int,',                                // 2
    ') error {',                                 // 3
    '    return nil',                            // 4
    '}'                                          // 5
  ];
  assert.equal(findBraceBlockEnd(multilineSig, 0), 5);
});

test('AST: parseGo receiver, multiline signature, imports, and calls', () => {
  const goCode = `
package service

import (
    "context"
    "fmt"
    chi "github.com/go-chi/chi/v5"
)
import "net/http"

type UserService struct {
    db *Database
}

type UserRepo interface {
    FindUser(id string) (*User, error)
}

func (s *UserService) GetUser(
    ctx context.Context,
    id string,
) (*User, error) {
    user, err := s.db.QueryUser(id)
    if err != nil {
        return nil, err
    }
    fmt.Println(user)
    return user, nil
}

func StandaloneHelper(x int) int {
    return x * 2
}
`;

  const parsed = parseSourceFile('services/user.go', goCode);

  // Imports
  assert.ok(parsed.imports.includes('context'));
  assert.ok(parsed.imports.includes('fmt'));
  assert.ok(parsed.imports.includes('github.com/go-chi/chi/v5'));
  assert.ok(parsed.imports.includes('net/http'));

  // Symbols
  const structSym = parsed.symbols.find((s) => s.name === 'UserService');
  assert.ok(structSym);
  assert.equal(structSym.kind, 'class');
  assert.equal(structSym.exported, true);

  const ifaceSym = parsed.symbols.find((s) => s.name === 'UserRepo');
  assert.ok(ifaceSym);
  assert.equal(ifaceSym.kind, 'interface');

  // Method with receiver
  const methodSym = parsed.symbols.find((s) => s.name === 'GetUser');
  assert.ok(methodSym);
  assert.equal(methodSym.kind, 'method');
  assert.equal(methodSym.exported, true);
  assert.ok(methodSym.signature?.includes('(s *UserService)'));
  assert.ok(methodSym.signature?.includes('GetUser'));
  assert.ok(methodSym.calls?.includes('QueryUser'));
  assert.ok(methodSym.calls?.includes('Println'));
  assert.ok(methodSym.endLine > methodSym.startLine);

  // Standalone function
  const helperSym = parsed.symbols.find((s) => s.name === 'StandaloneHelper');
  assert.ok(helperSym);
  assert.equal(helperSym.kind, 'function');
});

test('AST: parseRust functions, structs, traits, impls, imports, and exact endLine', () => {
  const rustCode = `
use std::sync::Arc;
pub use crate::models::{User, Role};

pub trait Authenticator {
    fn verify_token(&self, token: &str) -> bool;
}

pub struct AuthService {
    secret: String,
}

impl Authenticator for AuthService {
    fn verify_token(&self, token: &str) -> bool {
        let valid = validate_jwt(token);
        log_auth_attempt(valid);
        valid
    }
}

pub async fn hash_password(
    password: &str,
    cost: u32,
) -> Result<String, Error> {
    crypto_hash(password, cost)
}
`;

  const parsed = parseSourceFile('src/auth.rs', rustCode);

  // Imports & re-exports
  assert.ok(parsed.imports.some((i) => i.includes('std::sync::Arc')));
  assert.ok(parsed.imports.some((i) => i.includes('crate::models')));
  assert.ok(parsed.reExports && parsed.reExports.length > 0);

  // Trait
  const traitSym = parsed.symbols.find((s) => s.name === 'Authenticator');
  assert.ok(traitSym);
  assert.equal(traitSym.kind, 'interface');
  assert.equal(traitSym.exported, true);

  // Struct
  const structSym = parsed.symbols.find((s) => s.name === 'AuthService');
  assert.ok(structSym);
  assert.equal(structSym.kind, 'class');
  assert.equal(structSym.exported, true);

  // Impl
  const implSym = parsed.symbols.find((s) => s.name.includes('Authenticator for AuthService'));
  assert.ok(implSym);
  assert.equal(implSym.kind, 'class');

  // Async function with multiline signature & exact endLine
  const hashFn = parsed.symbols.find((s) => s.name === 'hash_password');
  assert.ok(hashFn);
  assert.equal(hashFn.kind, 'function');
  assert.equal(hashFn.exported, true);
  assert.ok(hashFn.signature?.includes('pub async fn hash_password'));
  assert.ok(hashFn.calls?.includes('crypto_hash'));
  assert.ok(hashFn.endLine > hashFn.startLine);
});

test('AST: parsePython multiline signatures, decorators, async, inheritance, imports', () => {
  const pyCode = `
import os, sys
from typing import Optional, List
from app.services import (
    BaseService,
    AuthException,
)
from .database import get_db

class UserService(BaseService, AuditableMixin):
    def __init__(self, db: Session):
        self.db = db

@router.post("/users", response_model=UserResponse)
@require_auth
async def create_user(
    name: str,
    email: str,
    role: str = "member",
) -> UserResponse:
    validated = validate_email(email)
    saved = save_user_record(name, email, role)
    notify_user(saved)
    return saved
`;

  const parsed = parseSourceFile('app/routes/users.py', pyCode);

  // Imports
  assert.ok(parsed.imports.includes('os'));
  assert.ok(parsed.imports.includes('sys'));
  assert.ok(parsed.imports.includes('app.services'));
  assert.ok(parsed.imports.includes('app.services.BaseService'));
  assert.ok(parsed.imports.includes('.database'));

  // Class with inheritance
  const classSym = parsed.symbols.find((s) => s.name === 'UserService');
  assert.ok(classSym);
  assert.equal(classSym.kind, 'class');
  assert.ok(classSym.signature?.includes('BaseService, AuditableMixin'));

  // Async function with decorators and multiline signature
  const fnSym = parsed.symbols.find((s) => s.name === 'create_user');
  assert.ok(fnSym);
  assert.equal(fnSym.kind, 'function');
  assert.equal(fnSym.exported, true);
  assert.ok(fnSym.signature?.includes('async def create_user'));
  assert.ok(fnSym.calls?.includes('validate_email'));
  assert.ok(fnSym.calls?.includes('save_user_record'));
  assert.ok(fnSym.calls?.includes('notify_user'));

  // Route extraction from @router.post
  assert.equal(parsed.routes.length, 1);
  assert.equal(parsed.routes[0].method, 'POST');
  assert.equal(parsed.routes[0].path, '/users');
  assert.equal(parsed.routes[0].handler, 'create_user');
});

test('Symbol Index: relative imports, alias resolution, re-exports, call graph', () => {
  const metadata = {
    urlOrPath: '.',
    name: 'test-project',
    branch: 'main',
    indexedAt: new Date().toISOString(),
    totalFiles: 0,
    languages: { ts: 4 },
    entryPoints: ['src/index.ts'],
    configs: {
      'tsconfig.json': {
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['./src/*'],
            '@components/*': ['./src/components/*']
          }
        }
      }
    },
    routes: []
  };

  const manager = new RepositoryIndexManager('.', metadata);

  // File 1: src/auth/token.ts defines generateToken
  manager.addFileResult(
    'src/auth/token.ts',
    [
      {
        name: 'generateToken',
        kind: 'function',
        filePath: 'src/auth/token.ts',
        startLine: 1,
        endLine: 10,
        exported: true,
        calls: ['signPayload']
      },
      {
        name: 'signPayload',
        kind: 'function',
        filePath: 'src/auth/token.ts',
        startLine: 12,
        endLine: 20,
        exported: false
      }
    ],
    [],
    []
  );

  // File 2: src/auth/index.ts re-exports generateToken from ./token
  manager.addFileResult(
    'src/auth/index.ts',
    [],
    [],
    ['./token'],
    [
      {
        fromModule: './token',
        exportedNames: ['generateToken'],
        filePath: 'src/auth/index.ts'
      }
    ]
  );

  // File 3: src/components/LoginButton.tsx imports using alias @/auth
  manager.addFileResult(
    'src/components/LoginButton.tsx',
    [
      {
        name: 'LoginButton',
        kind: 'function',
        filePath: 'src/components/LoginButton.tsx',
        startLine: 5,
        endLine: 25,
        exported: true,
        calls: ['generateToken', 'handleClick']
      }
    ],
    [],
    ['@/auth', './styles.css']
  );

  // File 4: src/server.ts imports via relative path ./auth/token.js (TS ESM pattern)
  manager.addFileResult(
    'src/server.ts',
    [
      {
        name: 'startServer',
        kind: 'function',
        filePath: 'src/server.ts',
        startLine: 10,
        endLine: 40,
        exported: true,
        calls: ['generateToken']
      }
    ],
    [],
    ['./auth/token.js']
  );

  // Test 1: Resolve relative import with .js -> .ts
  const resolvedEsm = manager.resolveImport('src/server.ts', './auth/token.js');
  assert.equal(resolvedEsm, 'src/auth/token.ts');

  // Test 2: Resolve alias import @/auth -> src/auth/index.ts
  const resolvedAlias = manager.resolveImport('src/components/LoginButton.tsx', '@/auth');
  assert.equal(resolvedAlias, 'src/auth/index.ts');

  // Test 3: traceSymbol('generateToken')
  const trace = manager.traceSymbol('generateToken');

  // Definitions
  assert.equal(trace.definitions.length, 1);
  assert.equal(trace.definitions[0].filePath, 'src/auth/token.ts');

  // Re-export tracking: src/auth/index.ts re-exported it
  assert.ok(trace.reExportedBy.includes('src/auth/index.ts'));

  // Imported by: direct (src/server.ts) and through re-export (src/components/LoginButton.tsx via @/auth)
  assert.ok(trace.importedBy.includes('src/server.ts'), 'Should include direct importer server.ts');
  assert.ok(trace.importedBy.includes('src/auth/index.ts'), 'Should include re-exporting file');
  assert.ok(trace.importedBy.includes('src/components/LoginButton.tsx'), 'Should include downstream consumer of re-export');

  // Call graph: callers of generateToken
  assert.ok(trace.callers.length >= 2);
  const callerNames = trace.callers.map((c) => c.name);
  assert.ok(callerNames.includes('LoginButton'));
  assert.ok(callerNames.includes('startServer'));

  // Call graph: callees of generateToken (it calls signPayload)
  assert.ok(trace.callees.length >= 1);
  assert.equal(trace.callees[0].calledName, 'signPayload');
  assert.equal(trace.callees[0].targetDefinitions[0].name, 'signPayload');
});
