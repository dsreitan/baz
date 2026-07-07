#!/usr/bin/env node
/**
 * Full-loop smoke test (Phase 7): builds the game, serves the production
 * bundle via `vite preview`, and drives a real browser through the whole
 * onboarding loop — new game -> pick starter -> camp -> start expedition ->
 * win the first battle -> reward screen -> back to the map — asserting no
 * uncaught page errors along the way.
 *
 * NOT a repo dependency: per the project's "vite/typescript/vitest only"
 * dependency rule (IMPLEMENTATION_PLAN.md ground rules), `playwright` is
 * intentionally NOT added to package.json. This script requires it to be
 * importable at run time — install it wherever you run this from, e.g.:
 *
 *   npm install --no-save playwright          # in this repo, temporarily
 *   node scripts/smoke.mjs
 *   npm uninstall playwright
 *
 * or point Node at an external playwright install (a scratch directory with
 * its own node_modules) via NODE_PATH, or run this file with that directory
 * as the cwd. Either way, no changes to this repo's own dependency graph.
 *
 * Browser: uses whatever `playwright` resolves by default (respecting
 * PLAYWRIGHT_BROWSERS_PATH, per Playwright's own convention — see the
 * Playwright docs; this script does NOT run `playwright install`). If your
 * Chromium binary lives at a nonstandard path (as in some sandboxes), set
 * PLAYWRIGHT_CHROMIUM_PATH to it and this script will pass it through as
 * `executablePath`.
 *
 * Determinism: the game reads an optional `?seed=<number>` query param
 * (src/ui/devSeed.ts) that overrides every `Date.now()`-seeded Rng in the UI
 * layer (new-game creation AND in-battle rolls) — see that file's doc
 * comment for why both needed covering. This script always passes a fixed
 * seed so the run (starter roll, expedition layout, every damage roll) is
 * exactly reproducible.
 *
 * Usage:
 *   node scripts/smoke.mjs [--port 5190] [--seed 42] [--keep-open]
 *
 * Exit code 0 on success, 1 on any assertion/timeout failure.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', '5190'));
const SEED = arg('seed', '42');
const KEEP_OPEN = process.argv.includes('--keep-open');
const BASE_URL = `http://localhost:${PORT}/baz/?seed=${SEED}`;
const STEP_TIMEOUT_MS = 15000;

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

/** Run a command to completion, streaming output, rejecting on nonzero exit. */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit', ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
    child.on('error', reject);
  });
}

/**
 * Spawn `vite preview` in the background and resolve once it answers HTTP
 * requests. `detached: true` puts it in its own process group so
 * `killPreviewServer` can kill the whole tree (`npx` -> node -> vite's own
 * child processes) instead of leaking an orphaned server on exit.
 */
async function startPreviewServer() {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.on('data', (d) => process.stdout.write(`[vite preview] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[vite preview] ${d}`));

  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/baz/`);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  killPreviewServer(child);
  throw new Error(`vite preview did not become ready on port ${PORT} within ${STEP_TIMEOUT_MS}ms`);
}

/** Kill the whole `vite preview` process group (see the `detached: true` note above). */
function killPreviewServer(child) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}

async function main() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (err) {
    console.error(
      '[smoke] Could not import "playwright". This script deliberately does not add it as a repo dependency ' +
        '— install it (e.g. `npm install --no-save playwright` in this repo, or run from a directory that has ' +
        'it) and try again. Original error:',
      err.message,
    );
    process.exit(1);
  }

  log('building production bundle (npm run build)...');
  await run('npm', ['run', 'build']);

  log(`starting vite preview on port ${PORT}...`);
  const previewProcess = await startPreviewServer();

  const pageErrors = [];
  let browser;
  try {
    browser = await playwright.chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    log(`navigating to ${BASE_URL}`);
    await page.goto(BASE_URL);

    log('step: main menu -> New Game');
    await page.waitForSelector('.menu-slot-empty button.btn-primary', { timeout: STEP_TIMEOUT_MS });
    await page.click('.menu-slot-empty button.btn-primary');

    log('step: choose starter (default selection) -> confirm');
    await page.waitForSelector('.menu-new-game', { timeout: STEP_TIMEOUT_MS });
    await page.click('.modal-actions .btn-primary');

    log('step: camp loaded');
    await page.waitForSelector('.camp-screen', { timeout: STEP_TIMEOUT_MS });

    log('step: start expedition (default biome/tier)');
    await page.click('.camp-start-btn');
    await page.waitForSelector('.map-screen', { timeout: STEP_TIMEOUT_MS });

    log('step: enter the first available node (layer 0 is always a "battle" node)');
    await page.waitForSelector('.map-node.map-node-available', { timeout: STEP_TIMEOUT_MS });
    await page.click('.map-node.map-node-available');
    await page.waitForSelector('.battle-screen', { timeout: STEP_TIMEOUT_MS });

    log('step: fight to a decision (spam the first legal move until the end-of-battle modal appears)');
    let outcomeTitle = null;
    const battleDeadline = Date.now() + 60000;
    while (Date.now() < battleDeadline && !outcomeTitle) {
      const modalTitle = page.locator('.modal-title');
      if ((await modalTitle.count()) > 0) {
        outcomeTitle = (await modalTitle.first().textContent())?.trim() ?? null;
        break;
      }
      const moveBtn = page.locator('.action-moves .move-btn:not([disabled])').first();
      if ((await moveBtn.count()) > 0) {
        await moveBtn.click({ timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(300);
    }
    if (!outcomeTitle) throw new Error('battle never reached an end-of-battle modal within 60s');
    log(`step: battle ended — "${outcomeTitle}"`);
    if (outcomeTitle !== 'Victory!') {
      throw new Error(`expected the first battle to end in "Victory!" (fixed seed=${SEED}), got "${outcomeTitle}"`);
    }

    log('step: continue to the reward screen');
    await page.click('.modal-actions .btn-primary');
    await page.waitForSelector('.reward-screen', { timeout: STEP_TIMEOUT_MS });

    log('step: return to the expedition map');
    await page.click('.reward-continue-btn, .reward-screen .btn-primary');
    await page.waitForSelector('.map-screen', { timeout: STEP_TIMEOUT_MS });

    if (pageErrors.length > 0) {
      throw new Error(`page recorded uncaught errors:\n${pageErrors.join('\n')}`);
    }

    log('SMOKE TEST PASSED: new game -> starter -> camp -> expedition -> victory -> reward -> map, no page errors.');
  } finally {
    if (!KEEP_OPEN) {
      await browser?.close();
      killPreviewServer(previewProcess);
    } else {
      log('--keep-open set: leaving the browser and preview server running.');
    }
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
