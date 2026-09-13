// Shared test harness: starts its own Vite server (never touches a server someone else runs), drives system Chrome,
// collects named checks, exits non-zero on any failure. BASE_URL=http://host:port reuses an existing server instead.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome';
const PORT = Number(process.env.PORT ?? 5199);

async function waitFor(url, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`server at ${url} did not start`);
}

async function portBusy(base) { try { await fetch(base); return true; } catch { return false; } }

export async function startServer(mode) {
  if (process.env.BASE_URL) return { base: process.env.BASE_URL, stop() {} };
  const base = `http://localhost:${PORT}`;
  if (await portBusy(base)) throw new Error(`port ${PORT} is already in use — stop it, or set BASE_URL=${base} to reuse that server`);
  if (mode === 'preview') {
    await new Promise((res, rej) => spawn('npx', ['vite', 'build'], { stdio: ['ignore', 'ignore', 'inherit'] }).on('exit', (c) => (c === 0 ? res() : rej(new Error('vite build failed')))));
  }
  const args = mode === 'preview' ? ['vite', 'preview', '--port', String(PORT), '--strictPort'] : ['vite', '--port', String(PORT), '--strictPort'];
  const proc = spawn('npx', args, { stdio: ['ignore', 'ignore', 'inherit'], detached: true });
  const stop = () => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* already gone */ } };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(1); });
  process.on('uncaughtException', (e) => { console.error(e); stop(); process.exit(1); });
  process.on('unhandledRejection', (e) => { console.error(e); stop(); process.exit(1); });
  await waitFor(base);
  return { base, stop };
}

export async function launchBrowser() {
  return puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });
}

export function createSuite(title) {
  const results = [];
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      results.push({ name, ok: true });
      console.log(`  ok   ${name}${detail ? `  — ${detail}` : ''}`);
    } catch (e) {
      results.push({ name, ok: false, error: e });
      console.log(`  FAIL ${name}\n       ${e?.message ?? e}`);
    }
  };
  const summary = () => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${title}: ${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(', ')}` : ''}`);
    return failed.length === 0;
  };
  return { check, summary };
}

export function assert(cond, msg) { if (!cond) throw new Error(msg); }
export function assertEq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
