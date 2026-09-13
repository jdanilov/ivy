---
name: browse
model: sonnet
description: ⌬ Drive the user's own browser (logged-in Chrome/Brave profile) or a headless lab Chrome via agent-browser. Web tasks needing real logins, forms, scraping, screenshots, research.
---

# Browse

`agent-browser` CLI. Two sessions:
- **default** = user's real browser, attached over CDP. Logged in. Visible to user.
- **lab** = `--session lab`. Headless Chrome. No logins. Public pages, localhost, scraping, research.

## Connect (once per task)

```bash
bun .claude/skills/browse/scripts/connect.ts          # user browser · exit 2 → ask user to enable chrome://inspect/#remote-debugging, re-run
bun .claude/skills/browse/scripts/connect.ts lab
bun .claude/skills/browse/scripts/connect.ts status   # no side effects
```

Browser shows "allow debugging" dialog on new connections → tell user to approve. After connect never pass launch flags (`--cdp --pin-tab --headed --profile`) or `close` on default session: restarts daemon, new dialog. `--session lab close` is fine.

## Rules

- Own tab per task: `tab new --label <task> <url>`, address by label, `tab close <task>` at end. Other tabs allowed when needed.
- Costly (pay, create org/repo/account, delete, send, publish): AskUserQuestion once per session with concrete list, then proceed.
- Mode per task, prompt overrides. Foreground (setup/interactive): `tab <label>` to show, user watches. Background (research): never `tab <ref>` after `tab new`; commands keep hitting the pinned tab while user browses. No step log in chat either way.
- Human step (login, 2FA, CAPTCHA, payment): foreground tab, tell user what to do, `wait --url <glob>|--text <t>|<sel> --timeout <ms>`, continue.
- Default session is the user's live browser: no `cookies clear`, `storage clear`, `set viewport|device|geo`, `network route`. Bulk scraping → lab.
- Artifacts → `.claude/skills/browse/out/` (gitignored).

## Commands

Loop: `snapshot -i` → act on `@eN` → re-`snapshot -i` after navigation (refs expire).

```bash
agent-browser tab new --label gh <url> | tab gh | tab | tab close gh
agent-browser open <url> | back | reload
agent-browser snapshot -i [-s <css>]                 # interactive elems + refs
agent-browser click @e5 | fill @e3 "t" | type @e3 "t" | press Enter | check @e7 | select @e2 "v"
agent-browser find role button click --name "Create" | find label fill "Name" "v"
agent-browser get text @e1 | get url | get title | get value @e3
agent-browser eval "<js>" | eval --stdin < f.js      # last expr value
agent-browser wait --load networkidle | --url "**/x/**" | --text "Done" | @e9 | --fn "<js>"
agent-browser batch --bail "open <url>" "wait --load networkidle" "snapshot -i"
agent-browser screenshot .claude/skills/browse/out/x.png [--full] [--annotate]
agent-browser read <url>                             # page as markdown, no browser
agent-browser console | errors | network requests
agent-browser --session lab <any>
```

Broken: `agent-browser doctor`. Full ref: `agent-browser skills get core --full`.
