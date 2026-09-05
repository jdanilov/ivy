# Docs format

Every doc the Factory writes is read by an agent. Short, reasoning-first, cheap in tokens.
The one exception is `intent.md`, written for the human.

## Rules

- One idea per line. Never restate the line above in prose.
- Reasoning first: the why, then the what. A rule without its reason is a rule that gets dropped.
- Tables over prose for anything with more than two fields.
- Symbol diagrams over prose for flow. Raw text, never inside a code fence.
- File references as `@ path:line`. Code entities in backticks: `loadParts`, `.factory/claim`.
- No em-dashes. A comma, a colon or a new line says it.
- No box-drawing characters. Structure comes from indentation and glyphs.
- No filler: no "in order to", no "it is important to note", no restating the prompt.
- Names come from `docs/terminology.md`. No synonyms.

## Glyphs

| Glyph | Meaning           | Glyph | Meaning            |
|-------|-------------------|-------|--------------------|
| `●`   | entity, running   | `↻`   | loop, retry        |
| `○`   | pending, external | `✓`   | done, pass         |
| `≋`   | store, state      | `✗`   | failed, conflict   |
| `◇`   | decision          | `⊘`   | blocked, waiting   |
| `→`   | flow, call        | `◈`   | warning, edge case |
| `←`   | return            | `±`   | change             |
| `⇢`   | async, side effect|       |                    |

## Example

`● Worker`
  → reads `spec.md`, `acceptance.md`                  @ .factory/missions/x/spec.md
  ◇ blocked? → `mcp__factory__ask` ← answer
  → implements the step
  ⇢ SubagentStop saves `handoffs/<step>.md`
  ← handoff
