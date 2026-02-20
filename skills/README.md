# Context Cache Skills

This directory contains skills for Claude Code (and other AI coding assistants) to guide them in using the Context Cache MCP tools effectively.

## Available Skills

### 1. conversations-search

Search through your own conversation history to recover context, decisions, and solutions from past sessions.

**MCP Tools Used:**
- `conversations_search` - Search indexed conversations
- `conversation_show` - Display full conversation content

**When to Use:**
- Starting any non-trivial task (check past sessions first)
- Finding previously implemented solutions
- Understanding historical decisions
- Debugging recurring issues

### 2. kb-search

Search through the markdown knowledge base to find documentation, notes, and reference material.

**MCP Tools Used:**
- `kb_search` - Hybrid search (BM25 + vector) across markdown files

**When to Use:**
- Finding existing documentation
- Checking what information is already stored
- Locating code examples or patterns
- Before adding new content (avoid duplicates)

### 3. kb-add

Add or update content in the knowledge base. Always searches first to avoid duplication.

**MCP Tools Used:**
- `kb_search` - Find existing content first
- Standard file tools (view, create, edit) - Update markdown files

**When to Use:**
- User asks to "remember this"
- Documenting important decisions
- Storing solutions to tricky problems
- Adding project-specific patterns

### 4. kb-organize

Organize the knowledge base according to standard structure (repos/ and topics/).

**Standard Structure:**
```
~/git/knowledge-base/
├── index.md                # Central index
├── repos/                  # Per-repository documentation
│   └── <repo-name>/
│       ├── overview.md
│       ├── architecture.md
│       └── ...
└── topics/                 # General technical topics
    ├── docker.md
    └── ...
```

**When to Use:**
- User requests knowledge base organization
- Files are misplaced or inconsistent
- After major documentation additions

## How Skills Work

Each skill contains a single `SKILL.md` file that provides:
- **Purpose** - What the skill does
- **When to Use** - Triggers and scenarios
- **MCP Tools Available** - What tools to use with parameters
- **Workflow** - Step-by-step process
- **Examples** - Concrete usage scenarios
- **Best Practices** - Do's and don'ts
- **Success Criteria** - How to know you've succeeded

## Using Skills with Claude Code

1. Place this `skills/` directory in your project
2. Claude Code will automatically discover these skills
3. Skills guide the agent on when and how to use MCP tools
4. Skills provide structured workflows and best practices

## MCP Server

The Context Cache MCP server exposes three tools:
- `kb_search` - Search knowledge base
- `conversations_search` - Search conversation history
- `conversation_show` - Display full conversations

See `src/mcp/server.ts` for implementation details.
