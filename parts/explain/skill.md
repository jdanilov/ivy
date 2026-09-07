---
name: explain
model: sonnet
description: ♻ Explain system flows with ASCII diagrams
---

# Explain

Research, visualize and explain code with diagrams first, prose second.

Arguments: $ARGUMENTS

## Modes

1. Arguments given: research mode, trace the topic through the code and explain it visually.
2. No arguments, uncommitted changes: diff mode, explain what changed and why, before and after.
3. No arguments, clean tree: ask what to explain.

### Research mode

- Read the files and trace the path. A grep hit is a lead, not an answer.
- Overview in a few sentences, then the diagram, then key files with `@ file:line`.
- Edge cases and gotchas at the bottom, each on a `◈` line.

### Diff mode

- `git diff` and `git diff --cached` for the changes.
- Per logical change: what changed as a before and after diagram, why it was needed, files touched.
- `±` marks a change set. BEFORE and AFTER are two lines sharing one `@ file:line`, then one WHY line.

## Symbols

Never box-drawing characters (┌─┐│└┘├┤┬┴┼). Never wrap a diagram in a code fence: raw text lets the
backtick highlights render.

| Symbol | Meaning              | Symbol | Meaning                |
|--------|----------------------|--------|------------------------|
| `●`    | entity, component    | `✓`    | success                |
| `○`    | external system      | `✗`    | failure                |
| `≋`    | data store, state    | `◈`    | warning, edge case     |
| `◇`    | decision, condition  | `±`    | change marker          |
| `→`    | flow, call           | `↻`    | cycle, retry           |
| `←`    | return, response     | `⇢`    | async, side effect     |

### Rules

- Backtick every in-code entity: functions, routes, tables, variables. Markers go inside: `● Client`.
- Data shapes inline in braces, no marker: `{ email, password }`.
- Stay flat. Indent only at a `◇` decision, never for sequential steps.
- Failure inline on the `◇` line, the next line continues the happy path. Tree branches `├─` `└─`
  only when both paths continue for several steps.
- Right-align file references as `@ file:line`. No borders: indentation and symbols carry structure.

### Example

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
  ⇢ emit 'order.created'
  ← 201 { orderId, total }

◈ Stripe webhook may arrive before the response, `createOrder` is not idempotent

## Output

- Diagram first, then brief text. No filler, no restating the obvious.
- End with the `◈` gotchas.
