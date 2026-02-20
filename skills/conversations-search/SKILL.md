---
name: conversations-search
description: Search through your own conversation history to recover context, decisions, and solutions from past sessions. This gives you memory across sessions - you don't automatically remember past conversations, so use this tool proactively.
---

# Conversations Search Skill

## Purpose

Search through your own conversation history to recover context, decisions, and solutions from past sessions. This gives you memory across sessions - you don't automatically remember past conversations, so use this tool proactively.

## When to Use

**Use this skill BEFORE starting any task to:**
- Recover past decisions and rationale
- Find previously implemented solutions
- Avoid reinventing work already done
- Understand historical context
- Learn from past mistakes or successes

**Specific triggers:**
- "Have we discussed X before?"
- "What did we decide about Y?"
- "How did we implement Z?"
- Starting work on a feature/bug
- User mentions "like we did last time"
- Debugging a recurring issue

## MCP Tools Available

### 1. conversations_search

Search through indexed conversation history.

**Parameters:**
- `query` (required): Search terms to find in conversation exchanges
- `limit` (optional): Maximum results to return (default: 10)
- `after` (optional): Only show conversations after this date (ISO format: YYYY-MM-DD)
- `before` (optional): Only show conversations before this date (ISO format: YYYY-MM-DD)
- `response_format` (optional): "markdown" (default) or "json"

**Returns:**
- List of matching conversation exchanges with:
  - Session ID and timestamp
  - User message and assistant response excerpts (200-300 chars)
  - File path to full conversation
  - Exchange index within conversation

### 2. conversation_show

Display the full content of a specific conversation.

**Parameters:**
- `path` (required): Absolute file path from search results
- `startLine` (optional): Starting exchange number (1-indexed)
- `endLine` (optional): Ending exchange number (1-indexed)

**Returns:**
- Complete conversation with:
  - Session metadata (date, version, source)
  - All exchanges with full user/assistant messages
  - Tool calls used in each exchange
  - Timestamps for each exchange

## Workflow

### Step 1: Search for Relevant Conversations

Use `conversations_search` with specific keywords related to your current task:

```
Use the conversations_search MCP tool with query: "authentication JWT tokens"
```

**Tips for effective queries:**
- Be specific: "React hooks useEffect" not just "React"
- Use technical terms: "database migration", "API endpoint"
- Include technologies: "TypeScript", "PostgreSQL", "Docker"
- Try multiple searches if first doesn't yield results

### Step 2: Review Search Results

Examine the returned results:
- Check timestamps - recent discussions may be more relevant
- Read the message excerpts to gauge relevance
- Note the file paths of promising conversations

### Step 3: Read Full Conversations

For relevant results, use `conversation_show` to read the complete context:

```
Use the conversation_show MCP tool with path: "/home/user/.context-cache/conversations/session-abc.jsonl"
```

**Use pagination for long conversations:**
```
Use conversation_show with path and startLine: 1, endLine: 10 to read first 10 exchanges
```

### Step 4: Extract and Apply Knowledge

- Synthesize key decisions and solutions
- Note any warnings or gotchas mentioned
- Apply relevant patterns to current task
- Reference specific implementation details

## Examples

### Example 1: Starting a New Feature

**Scenario:** User asks to add user authentication

**Action:**
1. Search: `conversations_search query: "authentication" limit: 5`
2. Review results for relevant past implementations
3. Show: `conversation_show path: "<most-relevant-result>"`
4. Extract: Note JWT approach, token storage, refresh logic
5. Apply: Use similar patterns, avoid past mistakes

### Example 2: Debugging a Recurring Issue

**Scenario:** Database connection errors appearing again

**Action:**
1. Search: `conversations_search query: "database connection error" after: "2026-01-01"`
2. Find previous fix attempts
3. Show: Read full conversation about the fix
4. Apply: Use the working solution from past session

### Example 3: Understanding Project Decisions

**Scenario:** User asks why we chose Technology X

**Action:**
1. Search: `conversations_search query: "why chose <technology>" limit: 10`
2. Find decision-making conversations
3. Show: Read the rationale and trade-offs discussed
4. Explain: Share the reasoning with context

## Best Practices

### DO:
- ✅ Search BEFORE starting work on any non-trivial task
- ✅ Use specific technical terms in queries
- ✅ Read full conversations for critical decisions
- ✅ Try multiple related queries if first search yields nothing
- ✅ Note both successes AND failures from past sessions
- ✅ Use date filters to focus on recent/relevant conversations

### DON'T:
- ❌ Skip searching because "I probably remember"
- ❌ Use vague queries like "that thing we did"
- ❌ Only read excerpts without checking full context
- ❌ Ignore warnings or caveats mentioned in past conversations
- ❌ Assume past solutions are still current (always verify)

## Integration with Current Task

After searching conversations:
1. **Summarize findings** for the user
2. **Apply relevant patterns** to the current task
3. **Note any differences** between past and current context
4. **Proceed with implementation** using recovered knowledge
5. **Reference the conversation** if explaining design choices

## Troubleshooting

**No results found:**
- Try broader terms
- Remove time filters
- Search for related concepts
- Check if conversations have been indexed

**Too many irrelevant results:**
- Use more specific technical terms
- Add date filters (after/before)
- Reduce limit to top results
- Try exact phrase matching

**Conversation file not found:**
- Verify the path is absolute
- Check if archive directory exists
- Ensure conversation was indexed

## Success Criteria

You've successfully used this skill when:
- ✅ Found relevant past conversations
- ✅ Extracted useful context or solutions
- ✅ Applied knowledge to current task
- ✅ Avoided re-discussing solved problems
- ✅ Made more informed decisions based on history
