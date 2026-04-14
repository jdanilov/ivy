---
name: research
description: ⭕ Comprehensive up-to-date web research via Grok AI. Use for fact-checked research with citations from multiple sources.
---

# Research

Web research powered by Grok AI's `web_search` tool (grok-4.20).

## Usage

```bash
bun .claude/skills/research/scripts/research.ts "query"
bun .claude/skills/research/scripts/research.ts "query" --x   # also search X/Twitter
```

## Tools

- `web_search` — always enabled, searches the web
- `x_search` — enabled with `--x` flag, searches X/Twitter posts and discussions

## Output

Markdown with query, findings, and source links saved to `docs/research/`. Errors return JSON with `error`, `message`, `code`.
