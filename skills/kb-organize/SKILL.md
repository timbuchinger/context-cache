---
name: kb-organize
description: Organize the knowledge base markdown files according to the standard structure. Use when the user asks to "organize my knowledge base", "clean up my notes", "restructure my documentation", or when files are misplaced, inconsistently named, or structure is unclear.
---

# Knowledge Base Organize Skill

## Standard Structure

```
~/git/knowledge-base/
├── index.md                    # Central index with references to all content
├── repos/                      # Repository-specific documentation
│   └── <repo-name>/           # One directory per repository
│       ├── overview.md        # Repository overview and purpose
│       ├── architecture.md    # Code structure and design patterns
│       ├── testing.md         # How to run tests
│       ├── deployment.md      # Deployment procedures
│       ├── troubleshooting.md # Common issues and solutions
│       └── ...                # Other repo-specific docs
└── topics/                     # General technical topics
    ├── docker.md              # Docker knowledge
    ├── kubernetes.md          # Kubernetes knowledge
    ├── typescript.md          # TypeScript patterns
    └── ...                    # Other topic files
```

## Workflow

### Step 1: Assess Current State

```bash
Use bash tool to list: ls -R ~/git/knowledge-base/
```

**Identify issues:**
- Files in wrong locations
- Missing index.md
- Inconsistent naming
- Duplicate content
- Orphaned files

### Step 2: Plan Organization

**For repository-specific content:**
- Move to `repos/<repo-name>/`
- Group by topic (overview, architecture, testing, etc.)
- One directory per repository

**For general technical topics:**
- Move to `topics/`
- One file per major topic
- Use descriptive kebab-case names

### Step 3: Move and Consolidate Files

**Move files:**
```bash
Use bash tool: mkdir -p ~/git/knowledge-base/repos/<repo-name>
Use bash tool: mv <source> <destination>
```

**Consolidate duplicates:**
```
Use view tool to read both files
Use edit tool to merge content into one file
Use bash tool to remove duplicate file
```

### Step 4: Create or Update Index

**Create index.md if missing:**
```
Use create tool with path: ~/git/knowledge-base/index.md
```

**Update index.md:**
```
Use edit tool to add new file references
```

**Index structure:**
```markdown
# Knowledge Base Index

## Repositories

- [Project Name](repos/project-name/overview.md)
  - [Architecture](repos/project-name/architecture.md)
  - [Testing](repos/project-name/testing.md)

## Topics

- [Docker](topics/docker.md)
- [Kubernetes](topics/kubernetes.md)
```

### Step 5: Verify Organization

```bash
Use bash tool to verify: ls -R ~/git/knowledge-base/
```

**Checklist:**
- ✅ All files in correct locations
- ✅ index.md exists and is up-to-date
- ✅ No orphaned files
- ✅ Consistent naming
- ✅ No duplicates

## Organization Principles

### Repository Documentation

**Location:** `repos/<repo-name>/`

**Standard files:**
- `overview.md` - What the project does, tech stack
- `architecture.md` - Code structure, design patterns
- `testing.md` - How to run tests, test structure
- `deployment.md` - How to deploy
- `troubleshooting.md` - Common problems and fixes
- `setup.md` - Development setup instructions

**Custom files:**
- Add as needed for project-specific topics
- Use descriptive names
- Keep focused (one topic per file)

### Topic Documentation

**Location:** `topics/`

**Naming:**
- Use kebab-case: `docker-compose.md`
- Be specific: `react-hooks-patterns.md` not `react.md`
- One file per major topic

**Content:**
- Technology-specific knowledge
- Cross-project patterns
- General best practices
- Reference material

## Best Practices

### DO:
- ✅ Follow standard structure
- ✅ Keep index.md updated
- ✅ Use descriptive file names
- ✅ Consolidate duplicate content
- ✅ Group related files together
- ✅ Create missing standard files (overview.md, etc.)

### DON'T:
- ❌ Mix repository and topic content
- ❌ Create deeply nested directories
- ❌ Use vague file names ("notes.md", "stuff.md")
- ❌ Leave duplicate content scattered
- ❌ Skip updating index.md

## Success Criteria

You've successfully organized the knowledge base when:
- ✅ All files follow standard structure
- ✅ index.md is complete and accurate
- ✅ Repository content is in repos/
- ✅ General topics are in topics/
- ✅ No duplicate content exists
- ✅ File names are clear and consistent
- ✅ Information is easy to find via kb_search
