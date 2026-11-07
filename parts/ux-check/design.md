# Design pass

What a designer sends back after every runtime check passed. Read by @UxCheck before the design
rows. The project's own design rules win on conflict, and its existing screens are the standard: a
finding names the rule or the neighbour it departs from, never a taste.

## Density

- Chrome (headers, status lines, hints, toolbars) is a tax on content. In the first viewport the
  content takes most of the height; a pane does not end in a void or spread its rows to fill.
- Status and meta of one subject share one row: a short label, a dropdown, an icon-button. Three
  stacked lines under a header is a finding.
- The smaller-form ladder, first rung that keeps the meaning wins: nothing → part of an existing row
  → an icon in an existing slot → icon + tooltip → inline text → its own row.
- Text nobody reads (an error paragraph per item, an explanation of a rare state) goes behind an
  icon + tooltip. A line that asks for an action stays visible, with its action on it.
- Say it once: one signal in the header, a row and a toast is two too many.
- Whitespace groups: a title sits closer to its meta than to the next record. A one-line row three
  times taller than its words is a fat row; rows spaced wider than they are tall is a loose list.

## Consistency

- A new element is built from what its neighbours use: component, slot, colour, radius, size,
  alignment. Same screen first, then the project's master screens.
- Siblings match: cards in a row share one height; every state of a list item fills the same slots.
- A control that looks foreign (another tooltip style, a centred grey popover) is a finding even
  when it works.
- Status colours mean status; one accent; a new colour needs a reason.
- One icon set, one size, one stroke per screen; filled at 14px and under. Never a hand-drawn glyph,
  never an emoji as an icon, no sparkle or purple to mean AI.

## Hierarchy

- The eye lands first on what the screen is for. Judge the silhouette at thumbnail size, then details.
- Flat (every object the same weight in the same bordered box) is fixed by size, space and one
  weight step, not by more boxes, borders, glows or accent rings.
- Simplify before polishing: the fewest surfaces and strings that do the job, then borders and
  badges only where earned. Nested boxes compete; quieten the supporting parts first.
- One primary action per region; a filled button keeps its colour on hover.
- Sentence case, no tracked caps unless the product capitalises. 13 to 14px names, 11 to 12px meta.

## Polish

- Words keep a 12px inset from the edge of a card, panel or hovered row (8px in a dense list), and
  the inset carries round the bottom: nothing glued to a panel's foot.
- A title over its subtitle: 4 to 6px of ink apart. Labels centre on their letters; a small icon
  aligns with the title's first line.
- Columns line up: every row on one grid, optional content keeps its empty track.
- No near-tangents: edges 1 to 3px apart read as an accident; align exactly or part by 8px or more.
- Text fits its box: no truncated chips, wrapped labels or ragged widths; a control hugs its content.
- Nested shapes pad evenly; outer radius = inner radius + padding. Dividers are straight.
- No redundant borders: try the fill alone. Dots, badges and rings sit inside the content edge.
- Quiet is not faint: secondary text still passes contrast on the real ground, in every theme.
- A bar with one control and an empty side looks unfinished: balance it or drop it.

## Motion

- What appears opens its space with it: a new row carries the rows below, an icon opens its width
  and gap together. Nothing pops in, nothing shoves a neighbour in one frame.
- A changing label keeps the control's width; a spinner takes an icon's slot, never a new one.
