---
name: kb-search
description: Search through the user's markdown knowledge base to find relevant notes, documentation, and information. The knowledge base contains structured information that the user has explicitly saved for future reference.
---

# Knowledge Base Search Skill

## Purpose

Search through the user's markdown knowledge base to find relevant notes, documentation, and information. The knowledge base contains structured information that the user has explicitly saved for future reference.

## When to Use

**Use this skill when you need to:**
- Find existing documentation on a topic
- Check what information is already stored
- Locate specific code examples or patterns
- Retrieve technical reference material
- Understand previously documented decisions
- Find related topics to current work

**Specific triggers:**
- "What do my notes say about X?"
- "Find documentation on Y"
- "Is there anything in the knowledge base about Z?"
- Before adding new information (check for duplicates)
- When user references "my notes" or "documentation"
- Starting work on documented projects

## MCP Tool Available

### kb_search

Search the knowledge base using hybrid search (BM25 + vector embeddings).

**Parameters:**
- `query` (required): Search query string
- `limit` (optional): Maximum number of results to return (default: 10)

**Returns:**
- JSON array of results with:
  - `file_path`: Absolute path to the markdown file
  - `chunk_index`: Position of the match within the file
  - `content`: Matching text content (with context)
  - `score`: Relevance score (higher = more relevant)

## Workflow

### Step 1: Search the Knowledge Base

Use `kb_search` with relevant keywords:

```
Use the kb_search MCP tool with query: "Docker container configuration"
```

**Query Tips:**
- Use specific technical terms
- Include technology names
- Try natural language questions
- Use multiple related terms

### Step 2: Review Search Results

The tool returns:
- File paths where matches were found
- Content snippets with matching text
- Relevance scores (0.0 to 1.0)

**Evaluate results:**
- Higher scores = more relevant
- Read content snippets for context
- Note file paths for deeper inspection

### Step 3: Open Relevant Files

If you need more context than the snippet provides:

**For direct access:**
```
Use the view tool to read the full file at: <file_path>
```

**For specific sections:**
```
Use view with view_range to read specific lines from the file
```

### Step 4: Synthesize and Apply

- Combine information from multiple results
- Extract relevant details for current task
- Reference the source files when explaining to user
- Note any gaps or outdated information

## Best Practices

### DO:
- ✅ Search before adding new information
- ✅ Use specific technical terminology
- ✅ Review multiple results for comprehensive understanding
- ✅ Open full files when snippets lack context
- ✅ Try multiple related queries if first search isn't helpful
- ✅ Reference specific file paths when citing information

### DON'T:
- ❌ Assume knowledge base is empty without searching
- ❌ Use only generic terms ("code", "setup")
- ❌ Rely solely on snippets for complex topics
- ❌ Ignore lower-scored results if they seem relevant
- ❌ Quote information without verifying by viewing the source

## Success Criteria

You've successfully used this skill when:
- ✅ Found relevant information in knowledge base
- ✅ Read full context when needed
- ✅ Verified information before claiming "nothing exists"
- ✅ Applied documented patterns/guidelines to current work
- ✅ Provided accurate citations (file paths)
