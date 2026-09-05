# Code format

Code is read far more often than it is written, and every line is one the next reader must hold
in their head. These rules buy that reader back.

- One reason to change per unit. A function that fetches and formats breaks twice for one bug.
- The plainest thing that works. Cleverness is a cost the reader pays and the writer never sees.
- Two copies are a coincidence, three are a duplication. Extract on the third, not on the first.
- No abstraction for one caller, no option nobody asked for. Code not written cannot break.
- Comments say why, never what: one line, and only where the code cannot say it itself.
- The neighbouring file settles naming, shape and style. The project's habits beat your taste.
