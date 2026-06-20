---
name: explain
model: sonnet
description: ♻ Research and visualize system flows with diagrams
---

# Explain

Research, visualize, and explain code with clear diagrams and structured analysis.

Arguments: $ARGUMENTS

## Modes

Detect which mode to use:

1. **If arguments are provided** → Research mode: explore the codebase, trace the topic, explain visually
2. **If no arguments and git has uncommitted changes** → Diff mode: explain what changed and why, with before/after comparison
3. **If no arguments and git is clean** → ask the user what to explain

## Instructions

### Research mode

1. Read relevant files, trace code paths, understand the implementation
2. Produce a visual-first explanation:
   - Overview (a few sentences max)
   - Flow diagram using the symbol vocabulary below, and / or sequence diagram, and / or ERD diagram etc. - whichever is appropriate to explain
   - Key files with `@ file:line` references right-aligned
   - Edge cases and gotchas at the bottom if appropriate

### Diff mode

1. Run `git diff` and `git diff --cached` to collect changes
2. For each logical change, produce:
   - **What** changed (flow diagram showing before/after)
   - **Why** it was needed
   - **Files** list with `@ file:line` and one-line description
3. Use `±` as section marker for change sets

## Symbol Vocabulary

Use these symbols consistently. Do NOT use box-drawing characters (┌─┐│└┘├┤┬┴┼). Do NOT wrap diagrams in code fences (``` blocks) — output them as raw text so backtick highlights render.

| Symbol  | Meaning                | Example                     |
|---------|------------------------|-----------------------------|
| `●`     | Entity / Component     | `● Client`, `● AuthService` |
| `○`     | External system        | `○ Stripe`, `○ Redis`       |
| `≋`     | Data store / state     | `≋ users`, `≋ session`      |
| `◇`     | Decision / condition   | `◇ found?`, `◇ valid?`      |
| `→`     | Flow direction / calls | `→ POST /login`             |
| `←`     | Return / response      | `← 200 { token }`           |
| `⇢`     | Async / side effect    | `⇢ emit 'user.created'`     |
| `✓`     | Success                | `✓ saved`                   |
| `✗`     | Failure                | `✗ ← 401 "denied"`          |
| `◈`     | Warning / edge case    | `◈ not idempotent`          |
| `±`     | Change marker (diff)   | `± Refactored auth`         |
| `↻`     | Cycle / retry          | `↻ retry 3 times`           |

### Naming rules

- Wrap all in-code entities in backticks: function names, routes, table names, variables — e.g. `findUser`, `/login`, `≋ users`
- Entity markers (`●`, `○`, `≋`) go inside the backticks: `● Client`, `○ Stripe`, `≋ Order`
- Data shapes are inline with curly braces, no special symbol: `{ email, password }`

### Diagram rules

- **Stay flat.** Only indent deeper at `◇` decision points, not for sequential steps.
- **Conditions: failure inline, happy path continues.** Write the failure outcome on the `◇` line itself. The next line continues the success path. Use `├─` / `└─` tree branches only when both paths have multi-step continuations.
- **Right-align file references** with `@ file:line` notation.
- **No borders.** Never use box-drawing border characters. Structure comes from indentation and symbols.
- **No code fences.** Output diagrams as raw markdown text (not inside ``` blocks) so that backtick highlights render properly.

### Flow diagram example

`● Client`
  → POST `/checkout` { cartId, paymentMethod }         @ routes/orders.ts:31
  → `loadCart`                                         @ services/cart.ts:18
  → `≋ Cart`
    ◇ empty? ← 400 "cart is empty"
  → `reserveStock`                                     @ services/inventory.ts:44
    ◇ unavailable? ← 409 { unavailable: [...skus] }
  → `chargePayment`                                    @ services/payment.ts:62
  → `○ Stripe` POST /charges
    ◇ failed? → `releaseStock` ← 402 "payment failed"
  → `createOrder`                                      @ services/orders.ts:88
  → `≋ Order` INSERT { status: "paid" }
  → `≋ Inventory` UPDATE quantities
  ⇢ emit 'order.created'
  ← 201 { orderId, total }

◈ Stripe webhook may arrive before response — `createOrder` is not idempotent

### Before/after example

± Batch Query Optimization — `UserService`

BEFORE
  → `getUsers`                                         @ services/user.ts:45
  → `≋ User` SELECT *
  → loop each user:
       → `≋ Role` SELECT * WHERE user_id = ?
  ◈ N+1: 101 queries for 100 users

AFTER
  → `getUsers`                                         @ services/user.ts:45
  → `≋ User` SELECT u.*, r.name FROM users u JOIN roles r ON ...
  ✓ 1 query regardless of count

WHY
  N+1 caused >3s page load at 100+ users.
  JOIN matches existing pattern in `● OrderService`.

FILES
  @ services/user.ts:45 — replaced loop with JOIN
  @ models/user.ts:12 — added role relation
  @ tests/user.test.ts:78 — updated assertions

## Output guidelines

- Visual first — lead with diagrams, follow with brief text
- Be concise — no filler, no restating the obvious
- Every function/route/table name in backticks
- Reference specific file locations with `@ file:line`
- End with `◈` warnings for gotchas and edge cases
