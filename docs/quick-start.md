# Quick Start Guide

Getting started with Context Cache skills and MCP tools.

## What Are Skills?

Skills are guidance documents that help AI coding assistants (like Claude Code) understand when and how to use the Context Cache MCP tools effectively. They provide structured workflows, examples, and best practices.

## Available Skills

### 🔍 conversations-search
Search your past conversation history to recover context and decisions.

**When to use:**
- Starting a new task and wondering "did we discuss this before?"
- Need to find a previous solution or implementation pattern
- Looking for context from past debugging sessions

**Quick usage:**
```
"Search my past conversations about authentication"
"Have we discussed JWT tokens before?"
"Find past sessions where we debugged database issues"
```

### 📚 kb-search
Search your markdown knowledge base for documentation and notes.

**When to use:**
- Looking for existing documentation or reference material
- Checking if information is already documented
- Need architectural or implementation details

**Quick usage:**
```
"Search my knowledge base for Docker setup notes"
"Find documentation on React hooks"
"What do my notes say about testing strategies?"
```

### ✍️ kb-add
Add or update content in your knowledge base.

**When to use:**
- You explicitly say "remember this for later"
- After solving a tricky problem
- When documenting architectural decisions

**Important:** Always search KB first to avoid duplicates!

**Quick usage:**
```
"Remember this solution for future reference"
"Add this to my knowledge base"
"Document this architectural decision"
```

### 🗂️ kb-organize
Organize your knowledge base according to standard structure.

**When to use:**
- You explicitly request organization
- Adding many related files at once
- Maintaining consistent structure

**Quick usage:**
```
"Organize my knowledge base"
"Clean up my notes structure"
"Restructure my documentation"
```

## Example Workflows

### Scenario 1: Starting a New Feature

**Agent workflow:**

1. **Search conversations first**
   ```
   Use conversations-search skill
   Query: "user authentication feature"
   Look for: Similar features implemented before
   ```

2. **Search knowledge base**
   ```
   Use kb-search skill
   Query: "authentication patterns"
   Look for: Documented approaches and best practices
   ```

3. **Implement using recovered context**
   - Apply patterns from past sessions
   - Reference documented approaches
   - Avoid previously identified pitfalls

4. **Document the solution**
   ```
   Use kb-add skill
   Document: Important decisions and patterns
   Location: repos/myproject/architecture.md
   ```

### Scenario 2: Debugging a Recurring Issue

**Agent workflow:**

1. **Check conversation history first**
   ```
   Use conversations-search skill
   Query: "database connection timeout"
   After: "2024-01-01"
   ```

2. **Review past solutions**
   - Read full conversation context
   - Identify what worked before
   - Check what didn't work

3. **Check documented fixes**
   ```
   Use kb-search skill
   Query: "database troubleshooting"
   Location: Look in repos/ for project-specific notes
   ```

4. **Implement fix using recovered context**
   - Apply proven solution
   - Update documentation if needed
   - Note any new learnings

### Scenario 3: Understanding a Design Decision

**Agent workflow:**

1. **Search conversations**
   ```
   Query: "why did we choose this approach"
   After: "2024-01-01"
   ```

2. **Read full conversation**
   - Understand rationale
   - See alternatives considered
   - Learn context and constraints

3. **Check KB for documented decision**
   ```
   Query: "architecture decision"
   Look for: decision logs or rationale docs
   ```

## MCP Tool Reference

### conversations_search

Search indexed conversation history.

**Parameters:**
- `query` (required): Search terms
- `limit` (optional): Max results (default: 10)
- `after` (optional): Date filter (ISO format, e.g., "2024-01-01")
- `before` (optional): Date filter (ISO format)
- `response_format` (optional): "markdown" or "json"

**Returns:** 
Matching exchanges with:
- Conversation metadata (timestamp, tool used, file path)
- Relevant excerpt from the exchange
- Score indicating relevance

**Example:**
```
User: Search my conversations for discussions about TypeScript types
Tool: conversations_search
Parameters: {
  "query": "TypeScript types",
  "limit": 5,
  "response_format": "markdown"
}
Results: [
  {
    "timestamp": "2024-02-15T10:30:00Z",
    "snippet": "When defining generic types, use <T extends> syntax...",
    "path": "/home/user/.context-cache/conversations/session-123.jsonl",
    "score": 0.92
  },
  ...
]
```

### conversation_show

Display a full conversation from a file path.

**Parameters:**
- `path` (required): Absolute path to conversation JSONL file
- `startLine` (optional): Starting exchange (1-indexed)
- `endLine` (optional): Ending exchange (1-indexed)

**Returns:** 
Formatted conversation with:
- Session metadata
- All exchanges (user message + assistant response)
- Tool calls used (if any)
- Timestamps

**Example:**
```
User: Show me the full conversation about TypeScript types
Tool: conversation_show
Parameters: {
  "path": "/home/user/.context-cache/conversations/session-123.jsonl",
  "startLine": 1,
  "endLine": 10
}
```

### kb_search

Search knowledge base with hybrid search (BM25 + vector).

**Parameters:**
- `query` (required): Search query
- `limit` (optional): Max results (default: 10)

**Returns:** 
Array of matches with:
- File path
- Relevant content snippet
- Score (0-1, higher is more relevant)
- Type (keyword or semantic match)

**Example:**
```
User: Find my React hooks documentation
Tool: kb_search
Parameters: {
  "query": "React useEffect hook",
  "limit": 5
}
Results: [
  {
    "path": "topics/javascript/react.md",
    "content": "useEffect runs after render: const [count] = useState(0);",
    "score": 0.95,
    "type": "keyword"
  },
  ...
]
```

## Best Practices

### For conversations-search ✅

**DO:**
- Search BEFORE starting a new task
- Use specific keywords from your problem
- Search across time ranges if needed
- Read full conversation for context

**DON'T:**
- Assume agent remembers past conversations
- Skip searching just because task seems new
- Only search for exact phrase matches (semantic search works too)

### For kb-search ✅

**DO:**
- Search BEFORE adding new content
- Use keywords and general terms
- Check existing docs to avoid duplication
- Review snippets to understand context

**DON'T:**
- Add duplicate content without checking
- Search only if you remember exact terms (fuzzy matching helps)
- Ignore search results that seem less relevant

### For kb-add ✅

**DO:**
- Search first to check for existing content
- Organize by repo or topic consistently
- Use descriptive file names
- Update existing docs rather than duplicating
- Document decisions and rationale

**DON'T:**
- Add before searching
- Create new files for content that belongs in existing files
- Skip organization (put files in right location)
- Forget to update index.md when adding new sections

### For kb-organize ✅

**DO:**
- Run after adding many new files
- Maintain standard structure (repos/, topics/)
- Update index.md with new content
- Keep file names lowercase with dashes

**DON'T:**
- Manually move files without using the skill
- Mix different naming conventions
- Forget to update index pages
- Reorganize without a clear goal

## Integration with Claude Code

Skills work seamlessly with Claude Code:

1. **Auto-discovery:** Place `skills/` directory in project root
2. **Automatic loading:** Claude Code auto-discovers skills
3. **Guided workflows:** Skills guide when/how to use MCP tools
4. **Structured approach:** Agent follows skill workflows

## Success Indicators

You'll know skills are working well when:

- ✅ Agent searches conversations before starting new work
- ✅ Agent searches KB before adding content
- ✅ Agent finds relevant past solutions
- ✅ Reduced duplicate documentation
- ✅ Consistent project structure
- ✅ Better knowledge organization

## Troubleshooting

### "No search results found"

**For conversations-search:**
- Try broader search terms
- Expand date range
- Check conversation archive exists at `~/.context-cache/conversations/`

**For kb-search:**
- Use more general terms
- Check KB files exist at configured location
- Verify files are markdown (.md)

### "Database not found" error

- MCP server automatically creates database on first use
- Check write permissions to `~/.context-cache/`
- Try running conversations-index sync manually first

### Skills not appearing in Claude Code

- Verify `skills/` directory exists in project root
- Restart Claude Code
- Check directory structure matches template

---

**Last Updated:** 2026-02-19  
**Version:** 1.0  
**Status:** Production Ready ✅

