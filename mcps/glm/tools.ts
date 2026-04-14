import { callProvider, type ProviderConfig } from './provider.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>, config: ProviderConfig) => Promise<string>;
}

// --- Think ---

const thinkPrompt = `You are a senior software architect helping decompose and reason about tasks.

Given a task description, provide a structured analysis:

## Understanding
Restate the task in your own words. Identify ambiguities.

## Decomposition
Break the task into concrete sub-tasks. Order them by dependency.

## Risks & Questions
List risks, unknowns, and questions that should be answered before implementation.

## Approach
Recommend a specific approach with justification.

Be concise. Use bullet points. Focus on actionable insights, not generic advice.`;

const thinkTool: Tool = {
  name: 'think',
  description: `Reason about a task: decompose it, identify risks, and recommend an approach.
WHEN TO USE: Before starting complex work. When you need a second opinion on architecture or trade-offs.
RETURNS: Structured analysis with understanding, decomposition, risks, and recommended approach.`,
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task or problem to reason about.' },
      context: { type: 'string', description: 'Additional context: project background, constraints, prior decisions.' },
    },
    required: ['task'],
  },
  async execute(args, config) {
    let msg = `Task: ${args.task}`;
    if (args.context) msg += `\n\nContext:\n${args.context}`;
    return callProvider({ config, systemPrompt: thinkPrompt, userMessage: msg });
  },
};

// --- Code ---

const codePrompt = `You are an expert programmer. Write clean, correct, production-ready code.

Rules:
- Follow the language's idioms and conventions
- Include only the code requested — no explanations unless asked
- Handle edge cases and errors appropriately
- Use clear variable/function names
- Keep it simple — no over-engineering

If the request is ambiguous, state your assumptions briefly before the code.`;

const codeTool: Tool = {
  name: 'code',
  description: `Generate code: write implementations, functions, modules, or scripts.
WHEN TO USE: When you want to delegate code generation to a secondary model.
RETURNS: Production-ready code with minimal explanation.`,
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'What to implement. Be specific about inputs, outputs, and constraints.' },
      language: { type: 'string', description: 'Programming language (e.g. typescript, python, go).' },
      context: { type: 'string', description: 'Existing code, interfaces, or project context to work with.' },
    },
    required: ['task'],
  },
  async execute(args, config) {
    let msg = `Task: ${args.task}`;
    if (args.language) msg += `\nLanguage: ${args.language}`;
    if (args.context) msg += `\n\nContext:\n${args.context}`;
    return callProvider({ config, systemPrompt: codePrompt, userMessage: msg });
  },
};

// --- Review ---

const reviewPrompt = `You are an expert code reviewer. Review code for correctness, security, performance, and style.

Format your review as:

## Critical Issues
Issues that will cause bugs or security vulnerabilities. Must be fixed.
- [BUG] Line N: description
- [SECURITY] Line N: description

## Warnings
Issues that may cause problems or degrade quality.
- [PERFORMANCE] Line N: description
- [ERROR-HANDLING] Line N: description

## Suggestions
Optional improvements for readability and maintainability.
- [STYLE] Line N: description

Be specific: reference line numbers, variable names, and explain WHY something is a problem.
If the code is good, say so briefly — do not invent issues.`;

const reviewTool: Tool = {
  name: 'review',
  description: `Code review: find bugs, security issues, performance problems, and style violations.
WHEN TO USE: When you want an independent review of code from a secondary model.
RETURNS: Structured review with issues categorized by severity.`,
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Source code to review. Pass the entire file content.' },
      file_path: { type: 'string', description: 'Original file path for language detection and context.' },
      focus: { type: 'string', description: 'Comma-separated focus areas: bugs, security, performance, style.' },
    },
    required: ['code'],
  },
  async execute(args, config) {
    let msg = '';
    if (args.file_path) msg += `File: ${args.file_path}\n`;
    if (args.focus) msg += `Focus: ${args.focus}\n`;
    msg += `\nCode to review:\n\`\`\`\n${args.code}\n\`\`\``;
    return callProvider({ config, systemPrompt: reviewPrompt, userMessage: msg });
  },
};

// --- Registry ---

export const allTools: Tool[] = [thinkTool, codeTool, reviewTool];
