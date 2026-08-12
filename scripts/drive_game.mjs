#!/usr/bin/env node
/**
 * Headless visual/perf smoke driver, for when there's no live browser to sit
 * in front of. Launches the dev server if one isn't already up, drives the
 * player car with real keyboard events (throttle, then a turn each way),
 * captures screenshots at each step, samples ~3s of requestAnimationFrame
 * timing at cruising speed, and reports any console/page errors.
 *
 * This is a proxy, not a replacement for a human at `npm run dev` — static
 * screenshots can't prove temporal properties (strobe, crawl). Use it to
 * de-risk before a real visual gate, not to close one.
 *
 * Usage: node scripts/drive_game.mjs [outDir]
 *   outDir defaults to .playwright-output/<timestamp>/
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 5173;
const URL = `http://localhost:${PORT}`;

const outDir = process.argv[2] ?? path.join(repoRoot, '.playwright-output', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(outDir, { recursive: true });

async function serverUp() {
  try {
    const res = await fetch(URL);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function ensureDevServer() {
  if (await serverUp()) return null; // already running — don't manage it
  const proc = spawn('npm', ['run', 'dev'], { cwd: repoRoot, stdio: 'ignore', detached: true });
  for (let i = 0; i < 30; i++) {
    if (await serverUp()) return proc;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('dev server did not come up within 30s');
}

async function main() {
  const spawned = await ensureDevServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500); // let async atlases resolve

  await page.screenshot({ path: path.join(outDir, '00_boot.png') });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, '01_cruise.png') });

  // Frame-time sample at cruising speed — a proxy for the >16.6ms perf gate
  // in plan.md §12, not the real mid-range-laptop profiling pass.
  const frameTimes = await page.evaluate(() => new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    function tick(t) {
      times.push(t - last);
      last = t;
      if (times.length < 180) requestAnimationFrame(tick);
      else resolve(times);
    }
    requestAnimationFrame(tick);
  }));

  // Short steer taps in each direction, on-road — a long hold drifts off-road
  // fast at speed and stops testing anything useful.
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, '02_left_turn.png') });
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '03_recentre.png') });
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, '04_right_turn.png') });
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');

  await browser.close();
  if (spawned) process.kill(-spawned.pid);

  const sorted = [...frameTimes].sort((a, b) => a - b);
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const report = {
    outDir,
    consoleErrors: errors,
    frameTimeMs: { avg, p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1] },
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

await main();
