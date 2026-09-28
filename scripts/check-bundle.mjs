#!/usr/bin/env node
// v2 bundle budget (PRD section 15): the JavaScript the v2 entry loads must stay
// under 3 MB gzipped. Run after `vite build`. Follows v2.html's module script and
// modulepreload links, so shared chunks count once and 1.x-only chunks don't count.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const BUDGET = 3 * 1024 * 1024;
const html = join(DIST, 'v2.html');
if (!existsSync(html)) {
  console.error(`check-bundle: ${html} not found — run \`npm run build\` first`);
  process.exit(1);
}

const doc = readFileSync(html, 'utf8');
const srcs = new Set();
for (const m of doc.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) srcs.add(m[1]);
for (const m of doc.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) srcs.add(m[1]);
if (srcs.size === 0) {
  console.error('check-bundle: no module scripts found in v2.html');
  process.exit(1);
}

let total = 0;
for (const src of srcs) {
  const bytes = gzipSync(readFileSync(join(DIST, src.replace(/^\//, ''))), { level: 9 }).length;
  total += bytes;
  console.log(`  ${(bytes / 1024).toFixed(1).padStart(8)} KB  ${src}`);
}
const mb = (total / 1024 / 1024).toFixed(2);
console.log(`v2 JS gzipped: ${mb} MB (budget 3.00 MB)`);
if (total > BUDGET) {
  console.error('check-bundle: over budget');
  process.exit(1);
}
