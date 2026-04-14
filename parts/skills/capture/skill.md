---
name: capture
description: ⭕ Screenshot capture tool. Takes full page or element-specific screenshots using Playwright.
---

# Capture

Fast Playwright-based screenshot capture tool for taking full page or element-specific screenshots.

## Usage

```bash
bun .claude/skills/capture/scripts/capture.js                                   # Capture localhost:3000 (default)
bun .claude/skills/capture/scripts/capture.js https://example.com               # Capture specific URL
bun .claude/skills/capture/scripts/capture.js -o custom.png                     # Custom output file
bun .claude/skills/capture/scripts/capture.js -s ".header" -o header.png        # Capture specific element
```

## Options

- `--url <url>` - URL to capture (default: http://localhost:3000)
- `-o, --output <file>` - Output file path (default: out/screenshot.png)
- `-s, --selector <css>` - CSS selector to capture specific element
- `-h, --help` - Show help message

## Notes

The tool waits for network idle, handles HTTPS errors, and completes in 1-4 seconds.
