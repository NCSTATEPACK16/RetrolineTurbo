import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hard rule 1 (CLAUDE.md): the simulation core is pure and deterministic.
 * It may not reach the renderer, the DOM, wall-clock time, or unseeded
 * randomness — and it avoids transcendental Math functions, whose results can
 * differ between JS engines and would desync ghosts recorded on another machine.
 */
const SIM_DIR = new URL('.', import.meta.url).pathname;

const BANNED: [RegExp, string][] = [
  [/from\s+['"]three(\/[^'"]*)?['"]/, 'imports three.js'],
  [/from\s+['"][^'"]*\/view\/[^'"]*['"]/, 'imports the view layer'],
  [/\b(document|window|navigator|localStorage)\s*\./, 'touches the DOM'],
  [/\b(requestAnimationFrame|performance\.now|Date\.now|setTimeout|setInterval)\b/, 'reads wall-clock time'],
  [/\bMath\.random\b/, 'uses unseeded randomness'],
  [/\bMath\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|pow|sinh|cosh|tanh|hypot|cbrt)\b/, 'uses an engine-dependent Math function'],
];

function simSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...simSources(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('v2 sim boundary', () => {
  const files = simSources(SIM_DIR);

  it('finds the sim sources', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(SIM_DIR.length), f]))('%s stays pure', (_rel, file) => {
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const violations = BANNED.filter(([re]) => re.test(src)).map(([, why]) => why);
    expect(violations, `${file} ${violations.join(', ')}`).toEqual([]);
  });
});
