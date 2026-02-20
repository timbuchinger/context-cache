---
name: kb-add
description: Directly add or update content in the user's markdown knowledge base. Use when the user says "remember this", "save this", or when discovering valuable information, making architectural decisions, or finding solutions worth preserving across sessions.
---

# Knowledge Base Add Skill

## Important: Search First!

**ALWAYS use kb_search BEFORE adding content to:**
- ✅ Avoid duplicate information
- ✅ Find existing related content
- ✅ Identify the right file to update
- ✅ Maintain consistency with existing documentation
- ✅ Organize information properly

## Workflow

### Step 1: Search for Existing Content

```
Use kb_search MCP tool with query: "<topic>"
```

**Evaluate results:**
- Found relevant file? → Update that file
- Found related content? → Add to related file or cross-reference
- Nothing found? → Create new file

### Step 2: Determine File Location

Based on content type:

**For repository-specific information:**
```
~/git/knowledge-base/repos/<repo-name>/<file>.md
```

**For general topics:**
```
~/git/knowledge-base/topics/<topic-name>.md
```

**Common files:**
- `overview.md` - Project overview and purpose
- `architecture.md` - Code structure and design
- `testing.md` - How to run tests
- `deployment.md` - Deployment procedures
- `troubleshooting.md` - Common issues and fixes

### Step 3: Read Existing File (If Updating)

```
Use view tool to read: <file_path>
```

### Step 4: Add or Update Content

**For new files:**
```
Use create tool with:
- path: ~/git/knowledge-base/topics/<name>.md
- file_text: <formatted markdown content>
```

**For updating existing files:**
```
Use edit tool with:
- path: <existing file path>
- old_str: <existing section>
- new_str: <existing section + new content>
```

## Content Guidelines

### What to Document

**DO document:**
- ✅ Solutions to non-obvious problems
- ✅ Architectural decisions and rationale
- ✅ Project-specific patterns and conventions
- ✅ Tricky setup or configuration steps
- ✅ Important gotchas or warnings
- ✅ Working code examples

**DON'T document:**
- ❌ Generic programming knowledge
- ❌ Information easily found in official docs
- ❌ Temporary notes
- ❌ Sensitive information (passwords, keys)

### Writing Style

Use clear markdown formatting:
- Start with brief description
- Use headings (##, ###)
- Include code blocks with language tags
- Add bullet points for lists
- Link to related files

## Best Practices

### DO:
- ✅ Search first to avoid duplication
- ✅ Add to existing files when relevant
- ✅ Use clear markdown formatting
- ✅ Include code examples
- ✅ Document the "why" not just the "what"
- ✅ Update index.md when adding new files

### DON'T:
- ❌ Create duplicate content
- ❌ Mix unrelated topics in one file
- ❌ Use vague descriptions
- ❌ Skip code examples
- ❌ Document everything (be selective)

## Success Criteria

You've successfully used this skill when:
- ✅ Searched first and avoided duplication
- ✅ Added content to appropriate file/location
- ✅ Used clear markdown formatting
- ✅ Included specific, useful information
- ✅ Content is discoverable via kb-search
