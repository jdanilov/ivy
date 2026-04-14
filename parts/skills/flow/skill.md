---
name: flow
model: sonnet
description: ⭕ Research and visualize system flows with diagrams
---

# 🤿 Research and visualize system flow

Research the specified topic and provide a visual, diagram-driven explanation.

Topic: $ARGUMENTS

## Instructions

1. **Research the topic** by reading relevant files, tracing code paths, and understanding the implementation
2. **Create a comprehensive but succinct explanation** that includes:
   - Overview summary (2-3 sentences)
   - Key components/files involved (with file paths and line numbers)
   - Data flow diagram(s) using Unicode box-drawing characters showing:
     - Sequential steps with arrows (↓ → ←)
     - Component interactions
     - Data transformations
     - Key decision points
   - Summary table if helpful (showing steps, locations, data formats, etc.)
   - Any important edge cases or gotchas

3. **Visual-first approach:**
   - Prioritize diagrams over text explanations
   - Use ASCII/Unicode diagrams liberally
   - Keep text explanations concise and to-the-point
   - Reference specific file locations with `file:line` format

4. **Diagram style guidelines:**
   - Use box-drawing characters: ┌─┐│└┘├┤┬┴┼
   - Use arrows for flow: ↓ → ← ↑
   - Use boxes to group related components
   - Label each step clearly
   - Show data formats at key transformation points

## Output format

```
## [Topic Name]

[2-3 sentence overview]

### Components Involved
- file/path.ts:123 - Component purpose
- file/path.ts:456 - Component purpose

### Data Flow

[Unicode box diagram showing the complete flow]

### Summary
[Table or brief bullet points of key takeaways]
```
