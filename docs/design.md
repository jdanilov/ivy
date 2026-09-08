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

- Header row: the brand glyph and the product name left, then the status of the selected row
  over the rest — a mission's state, its bar and metrics (`TIME 56m 54s · Input 324.0K · Cached
  16.8M · Output 111.0K`), a project's path and counts. One row, since two said no more.
  `Input` is what the turns added, cache writes included; `Cached` is what they re-read. A graph
  row's tokens are input plus output, so two steps compare and a late one is not heavier by
  its history. A row counts its own runner's turns: the session's for an orchestrator step, the
  sub-agent's for a worker or gatekeeper one, read from the `subagents/` files beside the
  transcript and matched to a role through the Agent call that spawned it. The mission total
  counts everyone.
  Thin separator rule directly below.
- Status, on that row: state dot and word left (`● RUNNING`), a two-tone progress bar (olive fill,
  `#404040` track) filling the middle, fraction and queued count right (`3/17 [+6]`).
- Two-column panes below the status bar: left pane wider for the active item's detail, right pane
  narrower for a list or a log. Each pane has its own bright heading, a thin rule, then rows. No
  vertical box-drawing rule between columns, a column gap does the separating.
- Bottom key bar: `Key Label` pairs, key in bright value color, label in dim label color, two spaces
  between pairs, pinned to the last line, thin rule above. The header's `Launch` and `Caffeinate`
  and the foot's `ACTIVITY` and `DECISIONS` carry their key as a bright first letter, the key's
  own colour, so the bar does not list `L`, `C`, `A` or `D`.
- Spacing: one blank line between a pane heading and its first row is not used, rows start right
  after the rule. No blank lines between consecutive log rows. CLI output keeps the 3-space `I`
  indent from `src/ui/theme.ts` to match the `@clack/prompts` gutter; the TUI has no gutter to match
  so its left margin is one cell.

## Mission Control

The screen the palette above was extracted for. One grid, the right pane follows the selection, and `?`
replaces it with the help panel. Sizes are what `render()` computes, not what a window manager decides.

```
row 0        blank
row 1        ⌬ FACTORY · status: mission bar or project bar, or the toast that replaces it
row 2        ───────────────────────────────────────────────────────────────────────
             PROJECTS (40%)          │  MESSAGES | MISSION | SESSION | PARTS (60%)
             inbox, Global,          │  a list above a detail block; a gate and a
             projects, missions,     │  decision each end in the command that
             sessions                │  answers them in the session
             ───────────────────────────────────────────────────────────────────────
             ACTIVITY  DECISIONS     one third of the body, all of it on a second A or D
             ───────────────────────────────────────────────────────────────────────
             to <session>            the message box, only while there is one
last row     ───────────────────────────────────────────────────────────────────────
             ↑↓ Select  ↵ Message  O Open Tab  K Kill  T Autonomy  E Archive  R Rename  M New Mission  S Show Archived  Q Quit  ? Help        Launch FG  Caffeinate AUTO [ON]
```

- Two blank columns down the left of every row, none on the right and none under the key bar: the
  screen breathes on the side the eye starts from and fills the rest.
- Left pane 40% of the width, minimum 30 cells, right pane the rest less the one-cell divider.
  Two cells of padding on the left pane keep its right-aligned wall time and diff off the divider.
  An open mission row ends in those two and no token count: the status bar has the tokens, and
  the row has no room. A mission or session under Claude Code's daemon carries a dim `bg`.
- `Global` sits above the projects and opens PARTS on `~/.claude/`: the user's own parts, in
  every project. Archived missions are off the list until `S` asks for them.
- The foot keeps a third of the body, never fewer than 5 rows; `A` or `D` pressed on the tab already drawn gives it all of it. Its header
  is the two tabs, the drawn one bright: ACTIVITY by default, DECISIONS on `D`, `A` back.

### The status bar

A mission is its state, a fixed eight-column word so the bar behind it never moves, then a
progress bar of its done steps, the fraction, and the metrics right. `PENDING` takes a warning
circle: a mission nobody has started is waiting on the human, where a pending *step* is only next
in line.

A project is its path, then what its missions are as counts, `1 running · 3 stub · 8 closed`,
the zeros left out; the Inbox, over every project, is how many projects there are and the same
counts. `Global` is `~/.claude has 5/17 parts installed`. The settings, `Launch` and
`Caffeinate`, sit at the right end of the key bar, beside the keys that turn them.

A session has no steps to bar and no project to count: `IDLE`, its id, preset and cwd, and how
long since its last event on the right.

A mission's one human line is the first paragraph of `## Goal` in its `intent.md`, and the MISSION
pane carries it under the rule, wrapped to two lines with an ellipsis where it cuts and a blank row
after: what the mission is for deserves whole lines, and a header's tail is where a line gets cut. A stub has no graph and no facts to state, so its right
pane is the intent form instead.

The SESSION pane says what ACTIVITY cannot at a glance: `now`, the `bash` or `sub` row still out
and how long it has been; `turn`, the open turn's tool count and length so far, or the last
turn's; `spend`, the session's own tokens in and out and `context`, what its last turn re-sent,
the one figure that says how full the window is. Its last word is the log's last row, and the
pane does not repeat it.

The bar is also the one line the screen takes a name on. `R` asks for one there — the label, what
has been typed, a cursor — and while the line is open every key is a character but `↵`, `Esc` and
backspace, `q` included. Nothing is written until `↵`; an empty line writes nothing.

### The message box

`↵` on a session row, or a mission row with a session, opens a box under the foot: the message,
wrapped at the width and grown to twelve rows before it scrolls to keep the cursor in view, with no
header naming the session, because the selected row already does. It is a small editor, because a reply is rarely one line: `↵` breaks a line, the arrows
walk the text, `home` `end` `^A` `^E` take the line's ends, `⌥⌫` or `^W` erases the word before
the cursor, `^K` the line, `^U` the draft, `^V` pastes the clipboard where `⌘V` is the terminal's
own paste, and `⇧↵` or `^S` sends — two chords because a terminal that does not speak the kitty
keyboard protocol sends `⇧↵` as `↵`. `Esc` hands the keys back and keeps the draft: there is one
per row, kept while the selection moves, so a half-written answer survives a look at another
session, and the box stays drawn, dim, wherever a draft is waiting. Sent, the draft goes. The key
bar names `⇧↵`, `⌥⌫`, `^K` and `^U` and nothing else: line breaks, arrows and `Esc` are what any
editor does.

The message goes into the session's inbox, the Unix socket Claude Code binds per session under
`/tmp/cc-socks/` and lists in `~/.claude/sessions/<pid>.json`: one JSON line in the
`stream-json` user shape. An idle session starts a turn on it; a busy one reads it between tool
calls, never mid-tool. Claude Code hands it over as a message from another session, so its first
line is `From the user, via Mission Control:` and the session treats what follows as the human's.
What a peer message cannot do is consent: a permission prompt or an `AskUserQuestion` picker is
answered in the tab, and the screen only shows that one is waiting. A session started with
`--dangerously-skip-permissions` holds a message from a sender with no permission class behind a
dialog unless its `crossSessionInbound` is `accept`; the sessions `O` starts carry that in their
settings overlay, a hand-started one needs it in `~/.claude/settings.json`.

### The intent form

A stub is written where it is read: `M` on any of a project's rows, or `↵` on a stub, gives the
right pane the INTENT form, and the status bar takes nothing. A status-bar line can ask for a name;
it cannot ask for the four sections the Orchestrator otherwise interviews the human for in the tab,
one turn late. The form is those sections, so `O` opens onto a filled `intent.md` and the session
starts working.

Six fields, in the order they are walked: `name`, a lowercase slug that is the folder and later
the branch, and fixed once the folder exists — renaming a stub is delete and remake, so on a stub
the name is drawn and never focused; `goal`, what the mission is for; `done looks like`, one per
line; `not in this mission`, the guardrails; `start from`, the files, docs and prior work; and
`autonomy`, the dial, `full | partial | none` with the chosen one bright.

Every field is a message-box draft — the same editor, the same wrap, the same cursor — so `↵` is a
line break inside a field and the field is changed with `⇥` and `⇧⇥`. `^S` saves: an empty goal or
a name that is not a slug, taken, or empty is refused with a toast naming the field and the cursor
put on it, and nothing is written. `Esc` hands the keys back and keeps the draft, one per row, so
`↑↓` between two stubs keeps what was typed into each; a draft nothing was changed in is dropped
instead, so the pane goes back to following `intent.md`. A new mission's draft belongs to its
project row and is shown there, dim, until it is saved, and while it shows, that row's pane is the
form and not Parts — the key bar lists the pane on screen. What `^S` writes is the whole of
`intent.md`: the form owns the file, `## Goal` is always there and a section with nothing in it is
left out.

A stub's autonomy is the form's dial and nothing else: `T` on a stub row says so rather than
writing beside a draft that would put its own value back on the next `^S`, and the key bar leaves
the key out on both sides. A dial turned in the form is a changed draft like any typing: `Esc`
keeps it and the pane goes on showing it, so a value the row never gave is never held unseen.

`O` on a stub whose goal is empty is refused — the session would only ask what the form is for.
The CLI's own `mission open` is not: running it is a deliberate act, and a bare stub is a fair
thing to open by hand.

### The Inbox

Every open gate, waiting decision and waiting question across all projects, keyed
`project/origin/label`. Each names the session command that answers it; a question names the tab
that owns it. An AskUserQuestion picker still up is one, whatever else the turn does; a turn that
ended is one only when its final message's last line ends in `?` or the turn put a picker up:
most final messages are statements, and a statement rings nobody. A closed mission raises nothing: its session id is a record, and the
session, if it still runs, is an unbound row that asks once under its own name. A key the last snapshot did not have rings the terminal bell and Warp's own
`777;notify`. Messages, the right pane over it, shows the selected item's body and that command.

### The foot: DECISIONS

One row per decision of whatever the left column has selected — a mission, a project's open
missions, or every open mission on the Inbox and Global rows — newest last, the mission column present only
when more than one is in scope. A closed mission's decisions are its record: select it to read
them. A decision is a fork an agent took; the screen never answers one.

ACTIVITY is read from Claude Code's transcripts — `bash`, `edit`, `read`, `sub`, `ask`, `agent`,
`tool` — plus the hook's own two rows, `user` for each prompt and `stop` for each turn's end,
newest last. A background sub-agent reporting back arrives as a prompt nobody typed; the hook logs
it as `SubagentReport` and the row reads `sub ← <what it was asked>`, never as `user`. A turn then
reads as it happened: prompt, tools, the model's words, stop, and a blank line under the stop so
turns read as paragraphs. A `bash` row is the tool's description, what the model said it was
doing, and only falls back to the command; a `sub` row is `→ <type> · <description>`; a `stop` row
sums its turn, `turn 2m 38s · 5 tools`. An `ask` row is the first question of an AskUserQuestion,
`· N more` when it put several, `○` while the picker is up and `●` once it is answered, the row
then reading `question → answer` for each: the session's own row says `asking` meanwhile, its bar
`ASKING`, and the Inbox lists the question. The time column is a clock on `user`, `agent` and whatever
opens a turn, and `+1:04` since the last of those on the tooling between them, in a stopwatch's
shape so the column scans: a turn is one time and the gaps under it. A `bash` or `sub` row carries
its outcome where its text starts, `○` while out, `●` green once its result landed, `●` red when
the result was an error or a background task ended `failed`: the transcript pairs each result to
its call by id, and a task notification names the call it ends. Words are bright — `user` red,
`agent` bright, `ask` yellow — tooling dim, `sub` blue with the name after its arrow bright, `edit`
green as a change. A row wraps under its text column to two lines and no more, except the last
three `agent` rows, which stand whole with their own line breaks, up to forty lines: what the
model just said is what the pane is opened for. A backticked span in a `user` or `agent` row is a
name the reader can go open, drawn blue with the backticks dropped. The hook clips a prompt at two lines. Each tab
carries `+N`, what came in since it was last open or left, so the hidden one says whether to
look; both reset when the selection changes.

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

PARTS wraps its descriptions the same way, under the description column, and a pane too narrow to
leave that column twenty cells drops the description whole rather than letting the edge cut it
mid-word. On the `Global` row the
status column is the scope, because scope is chosen there and nowhere else: one word, `project`,
`global` or `off`, `●` for a part that is going somewhere and `○` for one that is not, success
while a global part is in `~/.claude`, warning while it is not there yet or its copy has drifted,
dim for `project` and `off`. A status word beside it would say the same thing twice, so there is
none and the description keeps the rest of the row; under the rule the selected part names its
recommendation before its files, while the pane has the focus — unfocused it has no selection to
show, so it draws neither the marker nor those rows, the list alone. The rule and the lines under it keep the pane's bottom however
long the list is, and the list is what a short terminal loses, clipped around the row the
selection sits on: `↵` asks for a `Y` on the apply line, and an apply line drawn past the foot is
one nobody can read. A graph row in MISSION ends in two right-aligned columns, tokens
then wall time, so the numbers read down the pane, and a step the mission looped back to carries a
dim `×N` after its name. Under the facts, a DEVIATIONS sub-panel gives each entry its own wrapped
line, and is absent at zero. A session under a project is named by what `--name` or `/rename`
called it, else by its id, then `· <preset>`, never by its preset alone: two quick sessions must
not read the same. The `no missions` hint is absent while a session is standing there; with
nothing under a project at all it says `create one with M`. A session's mark is a diamond, `◈`
working and `◇` idle, where every mission row carries a circle: a session is a place you type
into, and the two kinds sit in one list where the tail of a row is too far to read a kind from.
The triangle `▸` is a command's, in front of the line a message says to type into a shell.
A session is `◈ working` from its prompt to its Stop — no hook fires in between, so the last event's age
says nothing — and `◈ working · <role>` while a sub-agent is out in the background; then the
turn that ended is not a question, and the Inbox lists it only once the last sub-agent has
reported back. `◇ idle <since its last Stop>` otherwise. A session is listed while the pid the
hook logged on its last event line is still a `claude` process: a tab closed on an idle session
fires no hook, and an idle session fires none either, so the file's age tells the two apart no
better than it tells a long think from a walk. A line from before pids were logged has only the
age: ten minutes.

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
| `↵`     | session, mission | write to the row's session: the message box                      |
| `↵`     | elsewhere        | open the selection, or apply what Parts has pending              |
| `⇧↵` `^S` | message box    | send; `⇧↵` only where the terminal tells it from `↵`              |
| `^U`    | message box      | clear the draft                                                  |
| `⌥⌫` `^W` | message box    | erase the word before the cursor                                 |
| `^K`    | message box      | erase the line the cursor is on                                  |
| `^V`    | message box      | paste the clipboard; `⌘V` is the terminal's own paste and lands the same |
| `Esc`   | message box      | keep the draft, hand the keys back                               |
| `↵`     | stub row         | edit its intent in the form, on the goal                          |
| `⇥` `⇧⇥` | intent form     | the next field, the one before; the last stop is the autonomy dial |
| `←→`    | intent form      | on autonomy, turn the dial; in a field, walk the text             |
| `^S`    | intent form      | save: the stub is made, or its `intent.md` and autonomy rewritten |
| `^U`    | intent form      | clear the field                                                   |
| `Esc`   | intent form      | hand the keys back; a draft nothing changed is dropped |
| `←`     | right            | back to the left pane                                            |
| `Esc`   | right            | back to the left pane; in Parts it discards the toggles first    |
| `Space` | Parts            | toggle a part; on `Global` cycle its scope project → global → off |
| `Y`     | Parts            | confirm the apply                                                |
| `N`     | Parts            | cancel it                                                        |
| `R`     | Parts            | reset the toggles                                                |
| `O`     | mission row      | open the mission's Warp tab with `/mission` as the session's first prompt: `claude` in the tab, or under `claude --bg` with the tab attached when `launch: bg`; a bound mission is refused |
| `K`     | mission, session | kill: `claude stop` for a session started under `--bg`, which keeps its conversation; SIGTERM for any other, SIGKILL on a second press |
| `T`     | mission, MISSION | autonomy full → partial → none; on a stub the form's dial is the writer and the bar does not offer the key |
| `E`     | mission row      | archive a closed mission or a stub, or bring an archived one back |
| `S`     | left             | show the archived missions                                       |
| `R`     | session          | rename a session; a mission's name is its branch and never moves |
| `M`     | project's rows   | the intent form for a new stub in that project; `O` promotes it  |
| `⇧↑↓`   | left             | move the row past its neighbour of the same kind; the order is kept in `~/.factory/config.yaml` |
| `L`     | any              | launch fg → bg, how `O` runs the next session; kept in `~/.factory/config.yaml` |
| `C`     | any              | caffeinate auto → on → off                                       |
| `D`     | any              | the foot draws DECISIONS; on it already, full height on and off  |
| `A`     | any              | the foot draws ACTIVITY; on it already, full height on and off   |
| `?`     | any              | the KEYS panel                                                   |
| `Q`     | any              | quit                                                             |

The key bar is built from the kind of row selected, so it never offers a key whose whole reply
would be a toast: a mission row answers `O K T E` and a stub `O K E`, a session row `K R`, a
project `M`, the Inbox and `Global` none of them; `↵` reads `Edit` on a stub, `Message` on a row
with a session behind it and `Open` on the rest. In the right pane the same rule drops `→ T
Autonomy` on a stub, whose pane is the form and not MISSION.

A session's name is Claude Code's own `custom-title` record, which nothing else may write, so `R`
keeps the Factory's word on the session's own events file: one `Rename` line carrying what the
last hook line carried, because the pid and the cwd the screen reads come off the last line. The
screen's name outranks the transcript's; it is the later word. The order `⇧↑↓` leaves is an
`order:` block in `~/.factory/config.yaml` — `projects`, `<project>/missions`,
`<project>/sessions`, each a list of names — replaced whole on every move, so a hand-written line
outside it stays. What a list does not name follows it, as it came: a new stub lands last, a
session that appears lands last.

The panel is HOW FACTORY WORKS, the primer, then TERMS, the words the screen uses, then KEYS, one
key to a line under its pane. Top down, so what a short terminal loses is the end of the key list,
which the bar repeats. While the Inbox is empty the panel stands where MESSAGES would, so a fresh
install opens on it.

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
| none                  | n/a                               | `◈` `◇` session | none                         | a session row, working or idle, so it never reads as a mission's `●` `○`; the doc glyphs' warning and decision readings do not apply on screen |
| none                  | n/a                               | `▸` command    | none                          | in front of a command a message says to type, never on a row |
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
