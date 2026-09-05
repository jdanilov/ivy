Worker (Opus) is building the prototype on branch `mission/control`. Mission `control` is open on the story workflow with the intent gate recorded as accepted from your confirmation, and a `prototype` step inserted before research and spec.

What the Worker delivers:
- `factory control --fixture` on `@opentui/core`, three right-pane modes, Droid look from `docs/design.md` and the seven screenshots.
- Fixture with ivy, igs, cut, five missions, three Inbox items, ten events.
- Text snapshots of each mode in the mission folder so I can review without a tty.

One CLI gap surfaced and went to the roadmap. `step add --after` on a done step leaves the pointer on the following step. I moved it by hand with a deviation entry.

I'll report when the prototype is committed. Then you run it in Warp and we adjust before the spec.
