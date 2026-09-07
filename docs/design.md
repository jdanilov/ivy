# Design language

The look for `factory` CLI output and for Mission Control, the OpenTUI screen. Extracted from seven Droid
Mission Control screenshots in this mission's `screenshots/` folder, pixel-sampled for color. Applies
to both surfaces so they read as one product. Terse-visual vocabulary: `● entity ○ pending ≋ store
◇ decision → flow ← return ⇢ async ↻ loop ✓ done ✗ failed ⊘ blocked ◈ warning ± change`.

## Palette

| Role            | Truecolor | ANSI 256 | Use                                              |
|-----------------|-----------|----------|---------------------------------------------------|
| background      | `#0a0a0a` | 232      | app background, no gradient, no panel fill        |
| panel           | `#0a0a0a` | 232      | same as background, panes divided by rule only    |
| separator       | `#232323` | 235      | 1px rule under the header and between pane blocks |
| dim label       | `#6e6e6e` | 242      | field labels, paths, timestamps, secondary text   |
| bright value    | `#e4e4e4` | 254      | values, pane headings, primary text               |
| accent orange   | `#d97757` | 173      | brand glyph, active highlight, key-bar keys       |
| success         | `#a8a968` | 143      | done word, filled progress bar, completed checks  |
| warning         | `#d7af5f` | 179      | drift, modified, extrapolated (absent in shots)   |
| error           | `#cc5555` | 167      | failed, conflict, extrapolated (absent in shots)  |
| selected row bg | `#b8b8b8` | 251      | inverted row background on focus                  |
| selected row fg | `#141414` | 233      | text on an inverted row                           |
| agent blue      | `#6b8fd9` | 68       | agent work: a step a sub-agent runs                |

Sampled from solid fills (progress bar, orange dot) where anti-aliasing is negligible; small text
undershoots these values on screen but the hierarchy holds.

## Type

- Monospace only, one family, one size, in both the CLI and the TUI. Marketing slide titles use a
  separate proportional display font and are out of scope.
- No italic anywhere in the reference shots.
- Weight is brightness and color, not font weight: dim gray reads as secondary, bright near-white as
  primary or active, orange as brand or accent, olive as success. Pane headings ("Active Feature",
  "Features", "Workers (4)") are bright value color, not a bold face.
- The only true inversion of weight is the selected row: dark text on a light fill, not a bold glyph.

## Layout

- Header row: brand glyph and product name pinned left, path or workflow name next, metrics
  right-aligned on the same line (`TIME 56m 54s · Input 324.0K · Cached 16.8M · Output 111.0K`).
  `Input` is what the turns added, cache writes included; `Cached` is what they re-read. A graph
  row's tokens are input plus output, so two steps compare and a late one is not heavier by
  its history. A row counts its own runner's turns: the session's for an orchestrator step, the
  sub-agent's for a worker or gatekeeper one, read from the `subagents/` files beside the
  transcript and matched to a role through the Agent call that spawned it. The mission total
  counts everyone.
  Thin separator rule directly below.
- Status bar: state dot and word left (`● RUNNING`), a two-tone progress bar (olive fill, `#404040`
  track) filling the middle, fraction and queued count right (`3/17 [+6]`).
- Two-column panes below the status bar: left pane wider for the active item's detail, right pane
  narrower for a list or a log. Each pane has its own bright heading, a thin rule, then rows. No
  vertical box-drawing rule between columns, a column gap does the separating.
- Bottom key bar: `Key Label` pairs, key in bright value color, label in dim label color, two spaces
  between pairs, pinned to the last line, thin rule above.
- Spacing: one blank line between a pane heading and its first row is not used, rows start right
  after the rule. No blank lines between consecutive log rows. CLI output keeps the 3-space `I`
  indent from `src/ui/theme.ts` to match the `@clack/prompts` gutter; the TUI has no gutter to match
  so its left margin is one cell.

## Mission Control

The screen the palette above was extracted for. One grid, the right pane follows the selection, and `?`
replaces it with the help panel. Sizes are what `render()` computes, not what a window manager decides.

```
row 0        blank
row 1        ⌬ FACTORY  <project or path>                        caffeinate AUTO [ON]
row 2        ───────────────────────────────────────────────────────────────────────
row 3        status: mission bar or project bar, or the toast that replaces it
row 4        ───────────────────────────────────────────────────────────────────────
             PROJECTS (40%)          │  MESSAGES | MISSION | SESSION | PARTS (60%)
             inbox, Global,          │  a list above a detail block; a gate and a
             projects, missions,     │  decision each end in the command that
             sessions                │  answers them in the session
             ───────────────────────────────────────────────────────────────────────
             DECISIONS  ACTIVITY     one third of the body, all of it on F
last row     ───────────────────────────────────────────────────────────────────────
             ↑↓ Select  ↵ Open  O Tab  X Kill  T Autonomy  H Archive  Z Archived  C Caffeinate  A Activity  F Full  ? Help  Q Quit
```

- Two blank columns down the left of every row, none on the right and none under the key bar: the
  screen breathes on the side the eye starts from and fills the rest.
- Left pane 40% of the width, minimum 30 cells, right pane the rest less the one-cell divider.
  Two cells of padding on the left pane keep its right-aligned tokens off the divider.
- `Global` sits above the projects and opens PARTS on `~/.claude/`: the user's own parts, in
  every project. Archived missions are off the list until `Z` asks for them.
- The foot keeps a third of the body, never fewer than 5 rows; `F` gives it all of it. Its header
  is the two tabs, the drawn one bright: DECISIONS by default, ACTIVITY on `A`, `D` back.

### The status bar

A mission is its state, a fixed eight-column word so the bar behind it never moves, then a
progress bar of its done steps, the fraction, and the metrics right. `PENDING` takes a warning
circle: a mission nobody has started is waiting on the human, where a pending *step* is only next
in line.

A project — or the Inbox, over every project — is one bar over its missions instead of the words
alone: closed green, open amber, stub grey, one segment each. The counts stay behind it as the
dim legend that names the colours.

A session has no steps to bar and no project to count: `IDLE`, its id, preset and cwd, and how
long since its last event on the right.

A stub has no graph, so the MISSION pane gives its title and the first paragraph under `## Why`
in its `intent.md` where the steps would be: two stubs differ by what they are for, not by name.

### The Inbox

Every open gate, waiting decision and waiting question across all projects, keyed
`project/origin/label`. Each names the session command that answers it; a question names the tab
that owns it. A turn that ended is a question only when its final message's last line ends in
`?` or the turn put an AskUserQuestion to the human: most final messages are statements, and a
statement rings nobody. A closed mission raises nothing: its session id is a record, and the
session, if it still runs, is an unbound row that asks once under its own name. A key the last snapshot did not have rings the terminal bell and Warp's own
`777;notify`. Messages, the right pane over it, shows the selected item's body and that command.

### The foot: DECISIONS

One row per decision of whatever the left column has selected — a mission, a project's open
missions, or every open mission on the Inbox row — newest last, the mission column present only
when more than one is in scope. A closed mission's decisions are its record: select it to read
them. A decision is a fork an agent took; the screen never answers one.

ACTIVITY is read from Claude Code's transcripts — `Bash`, `Edit`, `Read`, `Agent`, `Ask`, `Text`,
`Tool` — plus the hook's own two rows, `You` for each prompt and `Stop` for each turn's end,
newest last. A turn then reads as it happened: prompt, tools, the model's words, stop. A `Bash`
row is the tool's description, what the model said it was doing, and only falls back to the
command; an `Agent` row is `<type> · <description>`; a `Stop` row sums its turn, `turn 2m 38s ·
5 tools`. Words — `You`, `Text`, `Ask` — are bright, tooling dim, `Edit` green as a change. A row
wraps under its text column to two lines and no more.

A row is the verdict, the id and the decision itself. The step, the agent and the confidence that
filed it are in `decisions.md`; on screen they cost the columns the summary needs, and the verdict
already says whether anyone was asked. Nothing is cut: a summary too long for the line wraps under
its own column, so a row copies whole into the session that answers it.

```
✓ D2   Reuse readJson for the manifest rather than a second parser
? D3   Do not implement auth here: the contract names one endpoint and the session store already
       carries the flag — KISS and YAGNI
✗ D4   Triage r2: fix F1 and F3, skip F2 as cosmetic — fix F2 too, it is on the contract
✓ D1   Four workers, serial — one context per ground
```

| Status      | Glyph | Colour        | Row                                        |
|-------------|-------|---------------|---------------------------------------------|
| `waiting`   | `?`   | error red     | bright: the only one still asking something |
| `accepted`  | `✓`   | success olive | bright                                      |
| `overruled` | `✗`   | error red     | bright, the note follows the summary        |
| `auto`      | `✓`   | dim label     | dim: settled by the dial, not by a human    |

PARTS wraps its descriptions the same way, under the description column. On the `Global` row the
status column is the scope, because scope is chosen there and nowhere else: one word, `project`,
`global` or `off`, `●` for a part that is going somewhere and `○` for one that is not, success
while a global part is in `~/.claude`, warning while it is not there yet or its copy has drifted,
dim for `project` and `off`. A status word beside it would say the same thing twice, so there is
none and the description keeps the rest of the row; under the rule the selected part names its
recommendation before its files. The rule and the lines under it keep the pane's bottom however
long the list is, and the list is what a short terminal loses, clipped around the row the
selection sits on: `↵` asks for a `Y` on the apply line, and an apply line drawn past the foot is
one nobody can read. A graph row in MISSION ends in two right-aligned columns, tokens
then wall time, so the numbers read down the pane, and a step the mission looped back to carries a
dim `×N` after its name. Under the facts, a DEVIATIONS sub-panel gives each entry its own wrapped
line, and is absent at zero. A session under a project is named by what `--name` or `/rename`
called it, else by its id, then `· <preset>`, never by its preset alone: two quick sessions must
not read the same. The `no missions` hint is absent while a session is standing there. A session
is `● working` from its prompt to its Stop — no hook fires in between, so the last event's age
says nothing — and `● working · <role>` while a sub-agent is out in the background; then the
turn that ended is not a question, and the Inbox lists it only once the last sub-agent has
reported back. `○ idle <since its last Stop>` otherwise.

- Rules and the column divider are `#3a3a3a`, one step up from the sampled `#232323`, which
  disappears on a terminal background lighter than the screenshots'.
- The key bar sits on the last row and lists the focused pane's keys; `?` is the first pair
  dropped when the terminal is too narrow, because the panel it opens lists everything.
- No box carries a background: every cell the screen does not colour keeps the terminal's own.
  The one exception is the inverted selected row; the help panel paints nothing either.

### Step colours by role

A step's name is coloured by what kind of work it is, its glyph by where it is in its life, so one
row carries both without a legend. The kind comes from `stepRole` in `src/core/workflow.ts` — the
one place a runner is named — so the graph, `mission status` and a spawn can never disagree. A
parallel group takes its members' kind; a gate the human answers is the human's own; the three
step names a closed mission's workflow copy still carries keep the colours they had.

| Kind        | Colour    | Role                       | Steps                            |
|-------------|-----------|----------------------------|-----------------------------------|
| human       | `#a8a968` | `gate: human`              | intent, merge — and old `grill`   |
| gatekeeper  | `#d7af5f` | verifier, validator        | verify, validate, review — `accept` |
| agent       | `#6b8fd9` | worker, investigator       | implement, research               |
| technical   | `#6e6e6e` | orchestrator               | spec, an ungated merge — `condense` |

Each graph row names its runner beside the step, and its model where the runner is not this
session: `worker · opus`, `verifier · opus`, a bare `orchestrator`. Agent prompt colours follow
the same reading: Worker blue, Investigator cyan, Verifier and Validator yellow, Summarizer
magenta because Claude Code has no grey.

### Keys

One key to a line, in the panel and here: a line listing three keys is read as one thing three
keys do, and none of these three do the same thing.

| Key     | Pane             | Does                                                            |
|---------|------------------|------------------------------------------------------------------|
| `↑↓`    | any              | move the selection; scroll the foot while it is full             |
| `→`     | left             | enter the right pane                                             |
| `→`     | MISSION          | turn the autonomy dial, the pane's one focusable value           |
| `↵`     | any              | open the selection, or apply what Parts has pending              |
| `←`     | right            | back to the left pane                                            |
| `esc`   | right            | back to the left pane; in Parts it discards the toggles first    |
| `Space` | Parts            | toggle a part; on `Global` cycle its scope project → global → off |
| `Y`     | Parts            | confirm the apply                                                |
| `N`     | Parts            | cancel it                                                        |
| `R`     | Parts            | reset the toggles                                                |
| `O`     | mission row      | open the mission's Warp tab; a bound mission is refused          |
| `X`     | mission, session | SIGTERM the session's process, SIGKILL on a second press         |
| `T`     | mission, MISSION | autonomy full → partial → none                                   |
| `H`     | mission row      | archive a closed mission, or bring an archived one back          |
| `Z`     | left             | show the archived missions                                       |
| `C`     | any              | caffeinate auto → on → off                                       |
| `D`     | any              | the foot draws DECISIONS                                         |
| `A`     | any              | the foot draws ACTIVITY                                          |
| `F`     | any              | the foot at full height; header and status bar hidden            |
| `?`     | any              | the KEYS panel                                                   |
| `Q`     | any              | quit                                                             |

The key bar is built from the kind of row selected, so it never offers a key whose whole reply
would be a toast: a mission row answers `O X T H`, a session row `X`, a project, the Inbox and
`Global` none of them.

The panel is KEYS, then TERMS — one row per step kind in its own colour, then the words the screen
uses — then HOW FACTORY WORKS. The primer is what a short terminal loses: all of it or none, never
a sentence cut in half.

Messages answers nothing: a gate row and a decision row each carry the command that answers them
in the session that raised them, and `←`, `→` and `↵` on one write nothing.

## Glyphs

| Droid glyph          | Droid meaning                     | Terse-visual   | theme.ts symbol             | Conflict, pick                                  |
|-----------------------|------------------------------------|----------------|------------------------------|--------------------------------------------------|
| `●` header dot        | brand mark                        | `●` entity     | none                          | Factory needs its own mark, not Droid's `∴`      |
| `●` status bar dot    | running                           | `⇢` async      | `symbols.installed`          | reuses the entity dot, disambiguate by color only |
| `●` list row marker   | current or active item            | `●` entity     | `symbols.installed ●`        | same glyph as "installed", keep, context differs |
| `○` list row marker   | not started yet                   | `○` pending    | `symbols.notInstalled ○`     | same glyph as "not installed", keep              |
| `✓`                   | completed, success                | `✓` done       | `symbols.check ✓`            | aligned, no change                               |
| none shown (`Failed (0)` tab) | failure state             | `✗` failed     | `symbols.cross ✗`            | Factory renders `✗` where Droid had nothing      |
| `▲` (theme.ts only)   | n/a in Droid                      | `◈` warning    | `symbols.modified ▲`         | keep `▲` yellow for modified/drift only          |
| `▲` (theme.ts only)   | n/a in Droid                      | `✗` failed     | `symbols.conflict ▲`         | CONFLICT: modified and conflict share `▲`, differ only by color. Pick: conflict becomes `✗` red, modified keeps `▲` yellow |
| `→` indented result   | command or step result            | `→` flow       | none                          | adopt for verb-aligned log result lines          |
| `⋯>` dotted arrow     | continuation, more steps          | `→` flow       | none                          | drop the dotted variant, one arrow style          |
| `◉` / `◌`             | multiselect toggle (Droid absent) | `◇` decision   | `symbols.selected/unselected`| keep for `@clack` multiselect prompts only, not for TUI row focus which inverts background |
| `[+N]` suffix         | queued, not yet shown             | `±` change     | none                          | adopt the literal `[+N]` suffix, not a glyph     |
| `∴` brand glyph       | Droid's identity mark             | `●` entity     | none                          | replaced, Factory does not borrow Droid's mark   |
| none                  | waiting on a human decision       | `⊘` blocked    | none                          | new: open gate or claim conflict                 |

## Row states

| State            | Glyph | Color         | Example text        |
|------------------|-------|---------------|----------------------|
| pending          | `○`   | dim label     | `pending`            |
| running          | `●`   | accent orange | `RUNNING`, `running`  |
| done             | `✓`   | success olive | `done`, `Success`     |
| blocked          | `⊘`   | warning amber | `blocked`, `no session` |
| selected (focus) | none, inverted background | selected row bg/fg | (whole row inverts) |
| waiting-on-human | `⊘`   | warning amber | `gate open`           |

## Formats

| Format       | Pattern                                  | Example      | Source                          |
|--------------|-------------------------------------------|--------------|----------------------------------|
| relative time| `<1m ago` under a minute, else `Ng ago`   | `8m ago`     | Droid progress log               |
| duration     | `Xm Ys`, drop `m` under a minute          | `23m 25s`, `10s` | Droid mission and worker duration |
| counts       | `done/total [+queued]`                    | `3/17 [+6]`  | Droid status bar and pane header |
| tokens       | one decimal, `K` or `M` suffix, no space  | `287.0K`, `16.8M` | Droid token counters         |
| ids          | `#` plus 8 lowercase hex                  | `#05d6d5a6`  | Droid session ids in the log      |
| file lines   | `(N lines)` dim suffix after a filename   | `(87 lines)` | new, for factory log and diff output |

## Log conventions

- Verb column left-aligned at a fixed width (`Plan`, `Execute`, `End Feature Run`), the rest of the
  line follows two spaces later.
- The result line is indented to align under where the verb's text starts, prefixed `→`, rendered in
  dim label color regardless of pass or fail. Status is carried by the next event line, not by
  coloring the result.
- Long results truncate with `...` rather than wrapping past a couple of lines.

## CLI rules

- `factory status`: unchanged 3-space `I` indent and `statusSymbol`/`statusColor` from `theme.ts`.
  Add a Missions block using the same row-state glyphs: `●` running, `○` pending, `✓` done,
  `⊘` blocked. A mission with no live session prints `no session` in dim label color.
- `factory mission status`: header row is the brand glyph, mission name, and workflow name left,
  wall time, step, and round right, thin rule below. Steps print as a vertical list, not two panes,
  terminal width does not fit columns reliably: each line is a row-state glyph, the step name in
  bright value, timing in dim label, an inline `⊘` when a gate is open.
- Install output (`printPartResult`): keep `●` `▲` `○` from `theme.ts`, reassign `conflict` from `▲`
  to `✗` per the Glyphs table, colors unchanged otherwise.
- The 3-space `I` indent stays everywhere `theme.ts` prints text, CLI or plugin output alike.
- The CLI keeps 16-color ANSI escapes, it does not need truecolor to match this language: use
  `colors.yellow` for warning, `colors.red` for error, `colors.green` for success, and treat the
  existing `cyan`/`blue` as the closest 16-color stand-in for accent orange until a truecolor path
  exists. The OpenTUI Mission Control uses the truecolor palette above directly.

## Name mapping, Droid to Factory

| Droid           | Factory                | Note                                                        |
|-----------------|-------------------------|--------------------------------------------------------------|
| Feature         | Step                    | one unit of work inside a mission                            |
| Milestone       | Round                   | a validation boundary, closer to an accept-loop round than to a whole workflow |
| Worker          | Role                    | Droid has one generic worker, Factory has Worker, Verifier, Validator, Investigator, Summarizer |
| Credits         | Tokens                  | usage counters shown per session and per mission              |
| Active Feature  | Current step            | the detail pane for whatever the mission is doing now         |
| Progress Log    | Events                  | `~/.factory/events/<session>.jsonl`, rendered as a log pane   |
| Features pane   | Steps pane              | the right-hand checklist of the workflow                      |
| Workers pane    | Sessions                | the roster of sub-agent runs for the mission                  |
| RUNNING/Success/Failed | running/done/blocked | row-state words, see Row states; the Factory has no failed state |
