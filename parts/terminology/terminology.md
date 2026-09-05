# Terminology

Single source of names for this project. Agents and humans use these words and no synonyms.
Template seeded by the Factory. Replace every row, then link this file from `CLAUDE.md`.

The Factory's own vocabulary (Mission, Step, Gate, Worker, Verifier, Validator) lives in the
Factory repo. This file is the domain model: what the product calls its own things.

## Domain

| Term      | Meaning                                                           |
|-----------|-------------------------------------------------------------------|
| <Entity>  | What it is, and what it is not. One line.                          |
| <Entity>  | Prefer the word the users already say over the word in the schema. |

## States

| State     | Meaning                                | Reached from            |
|-----------|----------------------------------------|-------------------------|
| <state>   | What is true while the thing is here.  | <state>, <state>        |

## Surfaces

| Surface   | Meaning                                                |
|-----------|--------------------------------------------------------|
| <surface> | One screen, one command or one endpoint group.         |

## Rules

- One term, one meaning. A second meaning gets a second term.
- Names in code match names here. A rename lands in both or in neither.
- Retired terms stay listed for one release with `retired:` and what replaced them.
