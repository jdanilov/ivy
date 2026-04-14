# Ivy — Portable Development Harness

## Overview
Ivy is a CLI tool that installs a curated set of Claude Code skills, scripts, hooks, and MCP servers into any project via symlinks. One command to install, one to uninstall, clean tracking via manifest.

## Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript (strict, ES modules)
- **UI**: @clack/prompts for interactive menus

## Project Structure
- `src/` — CLI source code (entry point: `src/cli.ts`)
  - `core/` — registry, scanner, manifest, linker, env checking
  - `ui/` — theme (colors/symbols) and @clack/prompts wrappers
  - `commands/` — install, uninstall, status command handlers
  - `types.ts` — shared type definitions
- `parts/` — installable content (skills, scripts) symlinked into target projects
- `cycle/` — developer-critic loop engine (referenced by path, not copied)
- `mcps/` — MCP server implementations (referenced by path, not copied)

## Conventions
- Use Bun APIs where available (Bun.file, Bun.write, Bun.CryptoHasher)
- Use `node:` prefix for Node.js builtins (node:path, node:fs)
- All imports use ES module syntax
- Keep code minimal and clean — no over-engineering
