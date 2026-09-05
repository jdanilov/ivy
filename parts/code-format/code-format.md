# Code format

Code is read far more often than it is written, and every line is one the next reader must hold
in their head. Follow:

- SoC. Once concern per function / module. A function that fetches and formats breaks twice for one bug.
- KISS. The plainest thing that works. Cleverness is a liability.
- DRY. The less code the better.
- No abstraction for one caller, no option nobody asked for. Code not written cannot break.
- Comments say why, never what: one/two lines, and only where the code cannot say it itself.
- The neighbouring file settles naming, shape and style. The project's habits beat your taste.
