# AGENTS.md - Guidelines for AI Coding Agents

This document provides guidelines for AI coding agents (GitHub Copilot, Claude, Cursor, etc.) working on this codebase.

## 🚨 Mandatory Practices

### 1. **Test-Driven Development (TDD) - REQUIRED**

**Every feature MUST follow the RED-GREEN-REFACTOR cycle:**

1. **RED** - Write the test first, run it, watch it fail
   - Test must fail for the right reason (missing function/module, not typo)
   - Verify the failure message is what you expect
   
2. **GREEN** - Write minimal code to make the test pass
   - Only write code to satisfy the failing test
   - No extra features or "future-proofing"
   - Keep it simple and focused
   
3. **REFACTOR** - Clean up code while keeping tests green
   - Improve naming, extract functions, remove duplication
   - All tests must remain passing

**❌ NEVER:**
- Write implementation code before writing tests
- Skip watching tests fail
- Rationalize "just this once" shortcuts
- Add tests after implementation

**✅ ALWAYS:**
- Write test first
- Watch it fail (RED)
- Write minimal code (GREEN)
- Keep all tests passing

### 2. **Indexing Job Principles - REQUIRED**

All indexing jobs in this codebase MUST follow these three principles. **No exceptions.**

#### Principle 1 — Skip unchanged content (content hash or mtime)

Use a **content hash** (SHA-256) as the primary change-detection mechanism. Fall back to last-modified time (`mtime`) only when hashing the source is impractical (e.g. a live database). If the hash (or mtime) has not changed since the last index run, skip re-processing entirely.

```typescript
const fileHash = computeFileHash(filePath);
const existing = getFileByPath(db, relativePath);
if (existing && existing.hash === fileHash) {
  stats.filesSkipped++;
  continue; // unchanged — do nothing
}
```

#### Principle 2 — Remove ALL old content before re-adding

When content **has** changed, remove every previously-indexed piece of it first (all chunks, all exchanges, etc.), then re-process from scratch via the normal addition path. **Never do partial updates** — they leave orphaned data.

```typescript
// Delete ALL old chunks for this file before re-indexing
deleteChunksByFileId(db, existingFile.id);

// Delete ALL old exchanges before re-indexing a conversation
deleteExchangesForConversation(db, conversationId);
```

#### Principle 3 — Detect and remove deleted content

Every index run MUST compare the current set of source items (files on disk, sessions in an upstream DB, etc.) against what is already stored in our database. Any item that exists in the DB but is **absent from the source** has been deleted and MUST be removed from the database.

```typescript
// Knowledge-base files: compare DB records against current disk files
const dbFiles = getAllFiles(db);
for (const dbFile of dbFiles) {
  if (!currentFilePaths.has(dbFile.path)) {
    deleteChunksByFileId(db, dbFile.id);
    deleteFile(db, dbFile.id);
    stats.filesDeleted++;
  }
}

// Copilot conversations: compare DB records against current archive files
const copilotConversations = getAllConversationsBySource(db, 'copilot');
for (const conv of copilotConversations) {
  if (!filePathSet.has(conv.archivePath)) {
    deleteConversation(db, conv.id);
    result.conversationsDeleted++;
  }
}

// OpenCode sessions: compare DB records against current OpenCode sessions
const currentSessionIds = new Set(sessions.map(s => s.id));
const indexedConversations = getAllConversationsBySource(targetDb, 'opencode');
for (const conv of indexedConversations) {
  if (!currentSessionIds.has(conv.id)) {
    deleteConversation(targetDb, conv.id);
    result.conversationsDeleted++;
  }
}
```

#### Where these principles are implemented

| Indexer | File | Hash | Remove on update | Delete detection |
|---------|------|------|-----------------|-----------------|
| Knowledge-base files | `src/indexer/index.ts` | ✅ SHA-256 | ✅ `deleteChunksByFileId` | ✅ compares DB vs disk |
| Copilot conversations | `src/conversations/indexer.ts` | ✅ SHA-256 | ✅ `deleteExchangesForConversation` | ✅ compares DB vs archive files |
| OpenCode sessions | `src/conversations/opencode-batch.ts` | ✅ SHA-256 (via indexer) | ✅ `deleteExchangesForConversation` | ✅ compares DB vs OpenCode sessions |

When adding a **new indexing job**, all three principles must be followed and covered by tests (RED → GREEN per TDD).

---

### 3. **Task Completion Checklist - REQUIRED**

Before marking any task as complete, you MUST:

```bash
# 1. Run all tests
npm test

# 2. Build the project
npm run build

# 3. Check for TypeScript errors
npx tsc --noEmit

# All three must pass with zero errors ✅
```

**No exceptions.** If any command fails, the task is not complete.

## Commit Messages

Use conventional commit style messages that are no longer than 8 words.

## 📁 Work Directory Structure

### Use `work/` for Temporary Files

All temporary work products MUST go in the `work/` directory (gitignored):

```
work/
├── plans/           # Implementation plans
├── test-output/     # Test run outputs
├── scripts/         # Temporary test scripts
├── notes/           # Session notes
└── experiments/     # Proof-of-concept code
```

**Examples of what goes in `work/`:**
- Implementation plans
- Test output files
- Debugging scripts
- Experiment code
- Session notes
- Scratch files

**Never commit:**
- Test output to repo root
- Temporary scripts
- Plan files (unless part of documentation)
- Debug logs

## 🏗️ Project Architecture

### Core Components (All TDD-built)

```
src/
├── database/        # SQLite operations (7 tests)
├── indexer/         # File processing, chunking, embedding (8 tests)
├── search/          # BM25, vector, hybrid search (13 tests)
└── shared/          # Types and utilities
```

### Current Status
- **Tests:** 28/28 passing ✅
- **TDD Compliance:** 100%
- **Build:** Clean compilation

## 📝 Code Style Guidelines

### TypeScript
- Use strict mode (already configured)
- Prefer interfaces over types for extensibility
- Use explicit return types for public functions
- Avoid `any` except when necessary (e.g., plugin typing)

### Testing
- Use descriptive test names: `test('returns results ordered by similarity', ...)`
- Proper setup/teardown (beforeEach/afterEach)
- Test real implementations, minimize mocking
- Use temporary files/databases for isolation

### File Naming
- Source files: `kebab-case.ts`
- Test files: `kebab-case.test.ts`
- Keep files focused (single responsibility)

### Comments
- Only comment code that needs clarification
- Prefer self-documenting code (clear names)
- Document public APIs with JSDoc

## 🔄 Git Workflow

### Commits
- Small, focused commits
- Clear commit messages
- Include co-author trailer:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

### Branches
- Use descriptive branch names
- Keep branches short-lived
- Merge frequently to avoid drift

## 🧪 Testing Examples from This Project

### Good Test Structure

```typescript
describe('Component Name', () => {
  let db: Database.Database;
  let testPath: string;

  beforeEach(() => {
    // Setup - create fresh state
    testPath = path.join(os.tmpdir(), `test-${Date.now()}`);
    db = initDatabase(testPath);
  });

  afterEach(() => {
    // Teardown - clean up
    db.close();
    fs.unlinkSync(testPath);
  });

  test('specific behavior description', () => {
    // Arrange
    const input = createTestInput();
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toBe(expected);
  });
});
```

### TDD Cycle Example

From this project's hybrid search implementation:

```typescript
// 1. RED - Write test first
test('combines BM25 and vector search results', async () => {
  const results = await hybridSearch(db, 'query', embedding, 10);
  expect(results).toBeDefined();
  expect(results[0]).toHaveProperty('content');
});

// Run: npm test -- hybrid
// ❌ FAIL: Cannot find module './hybrid'

// 2. GREEN - Minimal implementation
export async function hybridSearch(db, query, embedding, limit) {
  const bm25Results = bm25Search(db, query, limit);
  const vectorResults = vectorSearch(db, embedding, limit);
  const merged = mergeWithRRF([bm25Results, vectorResults]);
  return formatResults(merged.slice(0, limit));
}

// Run: npm test -- hybrid
// ✅ PASS

// 3. REFACTOR - Clean up while keeping tests green
// (Extract functions, improve naming, etc.)
```

## 🚀 Common Tasks

### Adding a New Feature

1. Create work plan in `work/plans/feature-name.md`
2. Write test in `*.test.ts` (RED)
3. Run test, watch it fail
4. Implement minimal code (GREEN)
5. Run test, verify it passes
6. Refactor if needed
7. Run full test suite: `npm test`
8. Build: `npm run build`
9. Commit changes

### Debugging Test Failures

```bash
# Run specific test file
npm test -- filename

# Run with verbose output
npm test -- --verbose

# Run single test
npm test -- -t "test name"

# Save output for analysis
npm test > work/test-output/debug.txt 2>&1
```

### Adding Dependencies

```bash
# Production dependency
npm install package-name

# Dev dependency
npm install --save-dev package-name

# After adding, verify build still works
npm run build
npm test
```

## 📊 Quality Standards

### Required Metrics
- **Test Coverage:** 100% of public functions
- **Build Status:** No TypeScript errors
- **Test Status:** All tests passing
- **Linting:** No errors (when linter configured)

### Performance Guidelines
- Tests should complete in <30 seconds total
- Individual tests should be <1 second
- Use mocks for slow operations (network, large files)

## 🎯 Project-Specific Guidelines

### CLI Command Exposure

**All user-facing commands MUST be exposed as bin entries, not npm scripts:**

```json
// ✅ CORRECT - package.json bin entries
"bin": {
  "context-cache-index": "dist/indexer-cli.js",
  "context-cache-search": "dist/search-cli.js",
  "context-cache-stats": "dist/stats-cli.js",
  "context-cache-mcp": "dist/mcp-server.js"
}
```

**Rationale:**
- ✅ Clean UX - Users type `context-cache-index`, not `npm run index`
- ✅ Global install - Works anywhere after `npm install -g`
- ✅ PATH friendly - Standard Unix executable pattern
- ✅ Consistent - All tools use same pattern
- ✅ Professional - Matches npm package standards

**npm scripts are ONLY for build/development tasks:**
```json
// ✅ CORRECT - npm scripts for development
"scripts": {
  "test": "jest",
  "build": "tsc",
  "clean": "rm -rf dist"
}
```

**When adding a new CLI command:**
1. Create `src/command-cli.ts` with `#!/usr/bin/env node` shebang
2. Add to `package.json` bin section
3. Build and test: `npm run build && context-cache-command --help`
4. Update documentation (README.md, docs/usage.md)

### Embedding Model
- Default: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- Local, no API keys required
- Use mock embedder in tests (fast, deterministic)

### Database
- SQLite with FTS5 for full-text search
- Use temp databases in tests
- Always close connections in teardown

### Search Strategy
- Hybrid search = BM25 + Vector + RRF
- BM25 for keyword matching
- Vector for semantic similarity
- RRF for intelligent fusion

## ❓ When in Doubt

1. **Write a test first** - It clarifies requirements
2. **Keep it simple** - Minimal code to pass tests
3. **Ask questions** - Use ask_user tool for clarification
4. **Check examples** - Look at existing test files
5. **Run tests frequently** - Fast feedback loop

## 🏆 Success Criteria

A task is complete when:

- ✅ Tests written first (TDD)
- ✅ All tests passing (`npm test`)
- ✅ Build successful (`npm run build`)
- ✅ No TypeScript errors
- ✅ Code committed with clear message
- ✅ Temporary files in `work/` directory
- ✅ Documentation updated if needed

Do not create a summary document unless asked to.

## 📚 References

- **TDD Guide:** See `TDD_IMPLEMENTATION_REPORT.md` for examples
- **Architecture:** See `README.md` for system overview
- **Remaining Work:** See `TODO.md` for task list
- **Original Plan:** See `PLAN.md` for full design

---

**Remember:** Test-Driven Development is not optional. It's the foundation of this codebase's quality and maintainability. Every line of production code must be test-driven.
