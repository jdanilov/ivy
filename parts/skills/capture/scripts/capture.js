#!/usr/bin/env bun
import { chromium } from 'playwright'
import { parseArgs } from 'util'
import { mkdir } from 'fs/promises'
import { dirname, join, isAbsolute } from 'path'
import { fileURLToPath } from 'url'


const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    url: {
      type: 'string',
      default: 'http://localhost:3000',
    },
    output: {
      type: 'string',
      short: 'o',
      default: 'out/screenshot.png',
    },
    selector: {
      type: 'string',
      short: 's',
    },
    help: {
      type: 'boolean',
      short: 'h',
    },
  },
  allowPositionals: true,
})


if (values.help) {
  console.log(`
Screenshot Capture Tool

Usage: bun capture.js [options] [url]

Options:
  --url <url>           URL to capture (default: http://localhost:3000)
  -o, --output <file>   Output file path (default: out/screenshot.png)
  -s, --selector <css>  CSS selector to capture specific element
  -h, --help           Show this help message

Examples:
  bun capture.js
  bun capture.js https://google.com
  bun capture.js --url https://example.com --output example.png
  bun capture.js --selector ".main-content" -o content.png
`)
  process.exit(0)
}


const url = positionals[0] || values.url
const selector = values.selector

// Get the directory of this script
const scriptDir = dirname(fileURLToPath(import.meta.url))

// Resolve output path relative to script directory if it's a relative path
let output = values.output
if (!isAbsolute(output)) {
  output = join(scriptDir, output)
}


async function capture () {
  const startTime = Date.now()

  try {
    await mkdir(dirname(output), { recursive: true })

    console.log(`Launching browser...`)
    const browser = await chromium.launch({
      headless: true,
      args: ['--ignore-certificate-errors'],
    })

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    })

    const page = await context.newPage()

    console.log(`Navigating to ${url}...`)
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 10000,
    })

    const screenshotOptions = {
      path: output,
      fullPage: !selector,
    }

    if (selector) {
      console.log(`Finding element: ${selector}...`)
      const element = await page.locator(selector).first()
      await element.waitFor({ state: 'visible', timeout: 5000 })

      const box = await element.boundingBox()
      if (!box) {
        throw new Error(`Element ${selector} not found or not visible`)
      }

      screenshotOptions.clip = {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }
    }

    console.log(`Taking screenshot...`)
    await page.screenshot(screenshotOptions)

    await browser.close()

    const duration = Date.now() - startTime
    console.log(`✓ Success: Screenshot saved to ${output} (${duration}ms)`)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`✗ Failure: ${error.message} (${duration}ms)`)
    process.exit(1)
  }
}


capture()
