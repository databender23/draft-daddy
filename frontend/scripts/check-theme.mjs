#!/usr/bin/env node
/**
 * Theme integrity gate for the draft app's CSS. No dependencies; run with:
 *
 *   node scripts/check-theme.mjs        (from frontend/)
 *
 * Two checks, both fatal:
 *
 *  1. TOKEN PURITY — a raw color (#hex, rgb/rgba, hsl/hsla, color-mix, oklch, …)
 *     may appear ONLY inside the two theme blocks in src/styles.css
 *     (`:root[data-theme='light']` and `:root[data-theme='dark']`). Anywhere
 *     else it is a half-themed element waiting to happen.
 *
 *  2. VAR COVERAGE — every var(--x) referenced by any stylesheet under src/
 *     must be defined in BOTH theme blocks, so neither theme can fall back to
 *     an inherited or unset value.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const TOKEN_FILE = join(SRC, 'styles.css');
const BLOCK_SELECTORS = ["[data-theme='light']", "[data-theme='dark']"];

const RAW_COLOR =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\s*\(/g;
const VAR_USE = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
const VAR_DEF = /(--[a-zA-Z0-9_-]+)\s*:/g;

/** Blank out /* … *\/ comments while preserving line/column offsets. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
}

/** Byte range of the block whose selector contains `needle`, brace-matched. */
function blockRange(text, needle) {
  const selectorAt = text.indexOf(needle);
  if (selectorAt === -1) return null;
  const open = text.indexOf('{', selectorAt);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start: selectorAt, end: i + 1 };
    }
  }
  return null;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

const files = readdirSync(SRC)
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => join(SRC, name));

if (files.length === 0) {
  console.error('check-theme: no stylesheets found under src/');
  process.exit(1);
}

const failures = [];

// ---- locate the two theme blocks -------------------------------------------

const tokenSource = stripComments(readFileSync(TOKEN_FILE, 'utf8'));
const blocks = BLOCK_SELECTORS.map((selector) => {
  const range = blockRange(tokenSource, selector);
  if (!range) failures.push(`missing theme block  :root${selector}  in src/styles.css`);
  return { selector, range };
});

if (failures.length > 0) {
  failures.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}

// ---- check 1: token purity --------------------------------------------------

const impurities = [];
for (const file of files) {
  const text = stripComments(readFileSync(file, 'utf8'));
  const isTokenFile = file === TOKEN_FILE;
  RAW_COLOR.lastIndex = 0;
  let match;
  while ((match = RAW_COLOR.exec(text)) !== null) {
    const inBlock =
      isTokenFile &&
      blocks.some(({ range }) => match.index >= range.start && match.index < range.end);
    if (inBlock) continue;
    impurities.push(
      `${relative(ROOT, file)}:${lineOf(text, match.index)}  raw color ${match[0].trim()}`,
    );
  }
}

// ---- check 2: var coverage --------------------------------------------------

const defined = blocks.map(({ range }) => {
  const body = tokenSource.slice(range.start, range.end);
  const names = new Set();
  VAR_DEF.lastIndex = 0;
  let match;
  while ((match = VAR_DEF.exec(body)) !== null) names.add(match[1]);
  return names;
});

const used = new Map(); // name -> "file:line" of first use
for (const file of files) {
  const text = stripComments(readFileSync(file, 'utf8'));
  VAR_USE.lastIndex = 0;
  let match;
  while ((match = VAR_USE.exec(text)) !== null) {
    if (!used.has(match[1])) {
      used.set(match[1], `${relative(ROOT, file)}:${lineOf(text, match.index)}`);
    }
  }
}

const uncovered = [];
for (const [name, where] of [...used].sort()) {
  const missing = BLOCK_SELECTORS.filter((_, i) => !defined[i].has(name));
  if (missing.length > 0) {
    uncovered.push(`${where}  ${name} not defined in ${missing.join(' and ')}`);
  }
}

// Symmetry: a token present in one block but not the other is a latent bug even
// if nothing references it yet.
const asymmetric = [];
for (const name of new Set([...defined[0], ...defined[1]])) {
  const missing = BLOCK_SELECTORS.filter((_, i) => !defined[i].has(name));
  if (missing.length > 0) asymmetric.push(`${name} defined only outside ${missing.join(' and ')}`);
}

// ---- report -----------------------------------------------------------------

let failed = false;

if (impurities.length > 0) {
  failed = true;
  console.error(`\nTOKEN PURITY — ${impurities.length} raw color(s) outside the theme blocks:`);
  impurities.forEach((line) => console.error(`  ${line}`));
}

if (uncovered.length > 0 || asymmetric.length > 0) {
  failed = true;
  console.error(`\nVAR COVERAGE — ${uncovered.length + asymmetric.length} problem(s):`);
  uncovered.forEach((line) => console.error(`  ${line}`));
  asymmetric.sort().forEach((line) => console.error(`  ${line}`));
}

if (failed) {
  console.error('\ncheck-theme: FAILED\n');
  process.exit(1);
}

console.log(
  `check-theme: OK — ${files.length} stylesheet(s), ${defined[0].size} tokens defined in both themes, ` +
    `${used.size} referenced.`,
);
