# Docs format

Every doc the Factory writes is read by an agent first, and tokens are what reading it costs.
`intent.md` is the exception: it is written for the human.

- Reasoning before the conclusion. A rule without its reason is the first thing to get dropped.
- A table when the thing has more than two fields, a glyph flow when it is a sequence. Prose
  when neither shape carries more than a sentence would.
- Structure from plain characters: headings, indentation, glyphs, backticks. Nothing decorative.
- `@path` for a file, backticks for a code entity. Both are things the reader can go open.
- Names from `docs/terminology.md`, so two docs about one thing use one word.

## Glyphs

| Glyph | Meaning            | Glyph | Meaning            |
|-------|--------------------|-------|--------------------|
| `●`   | entity, running    | `↻`   | loop, retry        |
| `○`   | pending, external  | `✓`   | done, pass         |
| `≋`   | store, state       | `✗`   | failed, conflict   |
| `◇`   | decision           | `⊘`   | blocked, waiting   |
| `→`   | flow, call         | `◈`   | warning, edge case |
| `←`   | return             | `±`   | change             |
| `⇢`   | async, side effect |       |                    |
