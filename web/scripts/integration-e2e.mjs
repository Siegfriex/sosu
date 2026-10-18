// Cross-stack integration suite (Stage 1): real Chrome → production React build (VITE_API_MODE=http) → real HTTP →
// FastAPI (SOSU_py/scripts/serve_fake.py: real routes/validation/image normalisation/orchestration, deterministic
// Gemini gateway only) → structured JSON → React rendering. No Gemini key, no live inference.
//   npm run e2e:integration          → starts fake API :8000 + builds + previews :5197, runs, tears down what it started
//   FAKE_BASE=http://127.0.0.1:8000  → reuse an already running fake server (must expose /__fake__/*)
// Evidence: scripts/shots/integration/ (gitignored) — screenshots + results.json.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchBrowser, createSuite, assert, assertEq } from './lib/harness.mjs';

const WEB = resolve(import.meta.dirname, '..');
const PY = resolve(WEB, '../SOSU_py');
const SHOTS = resolve(WEB, 'scripts/shots/integration');
const OUT = resolve(WEB, 'node_modules/.sosu-integration-dist'); // separate outDir: never clobbers dist/ used by `npm run e2e`
const API_PORT = Number(process.env.API_PORT ?? 8000);
const WEB_PORT = Number(process.env.PORT ?? 5197);
const API = process.env.FAKE_BASE ?? `http://127.0.0.1:${API_PORT}`;
const BASE = `http://localhost:${WEB_PORT}`;
mkdirSync(SHOTS, { recursive: true });

const started = [];
const stopAll = () => { for (const p of started) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } } };
process.on('exit', stopAll);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopAll(); process.exit(1); });
process.on('uncaughtException', (e) => { console.error(e); stopAll(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(e); stopAll(); process.exit(1); });

async function up(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return true; } catch { /* not yet */ } await sleep(250); }
  return false;
}
async function busy(url) { try { await fetch(url); return true; } catch { return false; } }

/* ---------- fixtures: images generated with the backend venv's Pillow (scratch, not committed) ---------- */
const IMG = resolve(SHOTS, 'img');
mkdirSync(IMG, { recursive: true });
const gen = spawnSync(resolve(PY, '.venv/bin/python'), ['-I', '-c', `
import os, random
from PIL import Image
d = ${JSON.stringify(IMG)}
random.seed(7)
big = Image.effect_noise((2600, 2600), 90).convert('RGB')
big.save(os.path.join(d, 'product_big.png'))                     # ≫ 1.25 MB → must be compressed client-side
big.resize((1500, 1500)).save(os.path.join(d, 'oversize.jpg'), quality=97)   # raw > 1.25 MB, sent directly to API
Image.new('RGB', (900, 1600), (40, 60, 90)).save(os.path.join(d, 'small.jpg'), quality=85)
open(os.path.join(d, 'not_image.txt'), 'w').write('hello')
`], { encoding: 'utf8' });
if (gen.status !== 0) throw new Error(`fixture generation failed: ${gen.stderr}`);
const BIG = resolve(IMG, 'product_big.png');
const INSIGHTS = [1, 2, 3].map((i) => resolve(WEB, `src/assets/insight-${i}.jpg`));

/* ---------- services ---------- */
if (!process.env.FAKE_BASE) {
  if (await busy(`${API}/api/v1/health`)) throw new Error(`${API} already in use — stop it or set FAKE_BASE`);
  const p = spawn(resolve(PY, '.venv/bin/python'), ['scripts/serve_fake.py', '--port', String(API_PORT)], { cwd: PY, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
  started.push(p);
  console.log(`fake API pid=${p.pid}`);
}
if (!(await up(`${API}/api/v1/health`))) throw new Error('fake API did not start');
if (await busy(BASE)) throw new Error(`${BASE} already in use`);
const env = { ...process.env, VITE_API_MODE: 'http', VITE_API_BASE_URL: API };
const b = spawnSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { cwd: WEB, env, stdio: ['ignore', 'ignore', 'inherit'] });
if (b.status !== 0) throw new Error('vite build (http mode) failed');
const prev = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(WEB_PORT), '--strictPort'], { cwd: WEB, env, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
started.push(prev);
console.log(`preview pid=${prev.pid}`);
if (!(await up(BASE))) throw new Error('preview did not start');

const fake = {
  scenario: (scenario, extra = {}) => fetch(`${API}/__fake__/scenario`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario, times: 1, ...extra }) }).then((r) => { assert(r.ok, `scenario ${scenario}: HTTP ${r.status}`); }),
  reset: () => fetch(`${API}/__fake__/reset`, { method: 'POST' }),
  last: () => fetch(`${API}/__fake__/last-request`).then((r) => r.json()),
};

/* ---------- browser helpers ---------- */
const browser = await launchBrowser();
const { check, summary } = createSuite('integration');
const evidence = [];
let page;
let apiResponses = [];

async function freshPage(width = 390) {
  if (page) await page.browserContext().close();
  const ctx = await browser.createBrowserContext();
  page = await ctx.newPage();
  apiResponses = [];
  page.on('response', async (r) => {
    if (!r.url().startsWith(`${API}/api/v1/`) || r.request().method() !== 'POST') return;
    try { apiResponses.push({ url: r.url(), status: r.status(), body: await r.json(), fake: r.headers()['x-sosu-fake'] ?? null }); } catch { apiResponses.push({ url: r.url(), status: r.status(), body: null }); }
  });
  await page.setViewport({ width, height: 860, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { const st = document.createElement('style'); st.textContent = '.header{position:static !important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  return page;
}
const waitPath = (test, timeout = 20000) => page.waitForFunction((t) => { const p = document.querySelector('.app')?.getAttribute('data-path') ?? ''; return p === location.pathname && (t.startsWith('=') ? p === t.slice(1) : p.endsWith(t)); }, { timeout }, test);
const path = () => page.evaluate(() => document.querySelector('.app')?.getAttribute('data-path'));
const byText = async (text, tag = 'button') => { const xp = `xpath/.//${tag}[normalize-space(.)="${text}"]`; await page.waitForSelector(xp, { visible: true, timeout: 8000 }); const [h] = await page.$$(xp); await h.click(); };
const chip = async (q, label) => { const [h] = await page.$$(`xpath/.//*[@data-q="${q}"]//button[contains(@class,"chip") and normalize-space(.)="${label}"]`); assert(h, `chip ${q}/${label} not found`); await h.click(); };
const qInput = (id) => `[data-q="${id}"] input, [data-q="${id}"] textarea`;
const shot = (name, full = true) => page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: full });
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const alertText = () => page.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent.trim()).filter(Boolean).join(' | '));
const noOverflow = () => page.evaluate(() => ({ doc: document.documentElement.scrollWidth <= window.innerWidth, cards: [...document.querySelectorAll('.report-card, .card, .screen')].every((el) => el.scrollWidth <= el.clientWidth + 1) }));
const lastDiagResponse = () => [...apiResponses].reverse().find((r) => r.url.endsWith('/diagnosis'));
const lastPresResponse = () => [...apiResponses].reverse().find((r) => r.url.endsWith('/prescription'));

async function fillSurvey({ withChoices = true } = {}) {
  await page.goto(`${BASE}/survey/step/1`, { waitUntil: 'networkidle0' });
  await page.type(qInput('q01'), '통합테스트 공방');
  await page.type(qInput('q04'), '유리, 도자');
  if (withChoices) { await chip('q06', '디자인'); await chip('q06', '색감'); }
  await byText('다음'); await waitPath('/step/2');
  if (withChoices) { await chip('q09', '특별해서'); await chip('q09', '추억을 간직하려고'); await chip('q10', '감동'); }
  await byText('다음'); await waitPath('/step/3');
  if (withChoices) { await chip('q16', '조회수가 안 나와요'); await chip('q16', '팔로워가 안 늘어요'); await chip('q17', '제작 과정 위주'); await chip('q18', '얼굴만'); }
  await byText('다음'); await waitPath('/upload');
}
async function uploadProduct(file) { const input = await page.$('input[type=file]'); await input.uploadFile(file); await sleep(300); }
async function fillPrescription(files = INSIGHTS, url = 'https://www.instagram.com/reel/ABC123xyz/') {
  await page.goto(`${BASE}/prescription`, { waitUntil: 'networkidle0' });
  await page.type('input[type=url]', url);
  const input = await page.$('input[type=file]');
  await input.uploadFile(...files); await sleep(300);
}
const directPost = (endpoint, payload, files) => page.evaluate(async (api, endpoint, payload, files) => {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payload));
  for (const f of files) fd.append(f.field, new Blob([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], { type: f.type }), f.name);
  const r = await fetch(`${api}/api/v1/${endpoint}`, { method: 'POST', body: fd, headers: { 'X-Request-ID': `int-direct-${Date.now()}` } });
  return { status: r.status, body: await r.json() };
}, API, endpoint, payload, files);
const fileB64 = (p) => readFileSync(p).toString('base64');

/* ================= HEALTH ================= */
console.log('\n[HEALTH]');
// gemini_configured reflects the owner's .env.local and is reported, not asserted: the fake server never calls Gemini.
await check('fake API health: contract 1.0, deterministic fake gateway in use (X-SOSU-Fake: 1)', async () => {
  const r = await fetch(`${API}/api/v1/health`); const h = await r.json();
  assertEq([h.contract_version, r.headers.get('x-sosu-fake')], ['1.0', '1'], 'health'); return `gemini_configured=${h.gemini_configured} (unused by fake server)`;
});

/* ================= DIAGNOSIS ================= */
console.log('\n[DIAGNOSIS]');
await fake.reset();
await freshPage();
await check('INT-D1 diagnosis with product image → real HTTP → rendered result', async () => {
  await fillSurvey(); await uploadProduct(BIG); await shot('D1_upload', false);
  await byText('진단'); await waitPath('/generating'); await waitPath('/result', 60000); await shot('D1_result');
  const r = lastDiagResponse(); assert(r?.status === 200 && r.body?.ok, `response ${JSON.stringify(r?.status)}`);
  const d = r.body.data; const t = await text();
  const must = [d.positioning?.summary, ...(d.strengths ?? []).map((s) => s.title), ...(d.final_guidance ?? []).slice(0, 1)].filter(Boolean);
  const missing = must.filter((m) => !t.includes(norm(m)));
  assertEq(missing, [], 'structured fields not rendered');
  assertEq(['유형 1', '유형 2', '유형 3'].map((l) => t.includes(l)).concat(t.includes('유형 ○')), [true, true, true, false], 'reel type labels numbered');
  evidence.push({ id: 'INT-D1', request_id: r.body.request_id, fake: r.fake });
  return `request_id=${r.body.request_id} rendered ${must.length} key fields`;
});
await check('INT-D2 categorical codes + Q18 single value serialised to contract fields', async () => {
  const last = await fake.last(); const a = last.payload?.answers ?? {};
  assertEq({ q1: a.q1_brand_name, q6: a.q6_product_appeals, q9: a.q9_purchase_motives, q10: a.q10_desired_emotions, q16: a.q16_pain_points, q17: a.q17_current_formats, q18: a.q18_disclosure, cv: last.payload?.contract_version, loc: last.payload?.locale },
    { q1: '통합테스트 공방', q6: ['design', 'color'], q9: ['specialness', 'memories'], q10: ['moved'], q16: ['low_reach', 'low_follower_growth'], q17: ['process'], q18: 'face_only', cv: '1.0', loc: 'ko-KR' }, 'payload');
});
await check('INT-D3 product image compressed client-side and sent as multipart product_image', async () => {
  const last = await fake.last(); const f = (last.files ?? []).filter((x) => x.field === 'product_image');
  const orig = statSync(BIG).size;
  assert(f.length === 1, `files ${JSON.stringify(last.files)}`);
  assert(f[0].size_bytes <= 1250000 && f[0].size_bytes < orig, `size ${f[0].size_bytes} (orig ${orig})`);
  return `${orig} B → ${f[0].size_bytes} B ${f[0].content_type}`;
});
await check('INT-D4 responsive: result has no horizontal overflow at 320 / 1440', async () => {
  for (const w of [320, 1440]) { await page.setViewport({ width: w, height: 900 }); await sleep(200); assertEq(await noOverflow(), { doc: true, cards: true }, `@${w}`); await shot(`D4_result_${w}`); }
  await page.setViewport({ width: 390, height: 860 });
});
await check('INT-D5 email delivery in http mode is not faked (no /delivered without backend)', async () => {
  const btn = await page.$$('xpath/.//button[normalize-space(.)="진단서 받기"]');
  if (!btn.length) return 'delivery action not offered in http mode';
  await btn[0].click(); await sleep(500);
  const email = await page.$('input[type=email]');
  if (email) { await email.type('sosu@gmail.com'); const send = await page.$$('xpath/.//button[contains(normalize-space(.),"받기")]'); if (send.length) await send[0].click(); await sleep(1500); }
  await shot('D5_delivery', false);
  const p = await path(); assert(!String(p).endsWith('/delivered'), `reached ${p}`);
  return `stayed at ${p}; alerts: ${await alertText()}`;
});

await freshPage();
await check('INT-D15 three product images (multi-select) → 3 repeated product_image parts, each ≤ 1.25 MB', async () => {
  await fillSurvey({ withChoices: false });
  const input = await page.$('input[type=file]');
  assert(await input.evaluate((el) => el.multiple), 'product input is not multi-select');
  await input.uploadFile(BIG, resolve(IMG, 'small.jpg'), INSIGHTS[0]); await sleep(300);
  await byText('진단'); await waitPath('/result', 60000);
  const last = await fake.last(); const f = (last.files ?? []).filter((x) => x.field === 'product_image');
  assert(f.length === 3 && f.every((x) => x.size_bytes <= 1250000), `files ${JSON.stringify(last.files)}`);
  assert(lastDiagResponse()?.body?.ok, 'not ok');
  return f.map((x) => x.size_bytes).join('/');
});

await freshPage();
await check('INT-D6 diagnosis without image → success, no product_image part', async () => {
  await fillSurvey(); await byText('진단'); await waitPath('/result', 60000);
  const last = await fake.last(); assertEq((last.files ?? []).length, 0, 'files');
  assert(lastDiagResponse()?.body?.ok, 'not ok');
});

await freshPage();
await check('INT-D7 non-retryable INSUFFICIENT_INPUT (422) → back to input with actionable alert, no retry loop', async () => {
  await page.goto(`${BASE}/survey/upload`, { waitUntil: 'networkidle0' });
  await byText('진단'); await sleep(2500);
  const r = lastDiagResponse(); assertEq([r?.status, r?.body?.error?.code, r?.body?.error?.retryable], [422, 'INSUFFICIENT_INPUT', false], 'server');
  const p = await path(); await shot('D7_insufficient', false);
  assert(/\/survey\/(step\/\d|upload)$/.test(p), `path ${p}`);
  const a = await alertText(); assert(a.length > 0, 'no role=alert message');
  return `${p} — ${a}`;
});

await freshPage();
await check('INT-D8 provider error (retryable 502) → error screen → 다시 시도 → success', async () => {
  await fake.scenario('provider_error');
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/error', 60000); await shot('D8_error', false);
  assertEq([lastDiagResponse()?.status, lastDiagResponse()?.body?.error?.code], [502, 'MODEL_PROVIDER_ERROR'], 'server');
  assert((await alertText()).length > 0, 'no alert');
  await byText('다시 시도'); await waitPath('/result', 60000);
  assert(lastDiagResponse()?.body?.ok, 'retry did not succeed');
});

await freshPage();
await check('INT-D9 model timeout (504, injected instantly) → timeout error screen', async () => {
  await fake.scenario('timeout');
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/error', 60000); await shot('D9_timeout', false);
  assertEq([lastDiagResponse()?.status, lastDiagResponse()?.body?.error?.code], [504, 'MODEL_TIMEOUT'], 'server');
  const t = await text(); assert(t.includes('오래 걸리고'), 'timeout copy not shown');
});

await freshPage();
await check('INT-D10 repairable model output → real validator + one-shot repair → success rendered', async () => {
  await fake.scenario('repairable');
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/result', 60000);
  assert(lastDiagResponse()?.body?.ok, 'repair path failed');
});

await freshPage();
await check('INT-D11 repair failure (REPAIR_FAILED 502, retryable) → error screen', async () => {
  await fake.scenario('repair_failed');
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/error', 60000);
  assertEq(lastDiagResponse()?.body?.error?.code, 'REPAIR_FAILED', 'code');
});

await freshPage();
await check('INT-D12 stale response: reload during slow generation → late response never applied', async () => {
  await fake.scenario('slow', { delay_s: 4 });
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/generating');
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(5500);
  const p = await path(); assert(!String(p).endsWith('/result'), `stale result applied: ${p}`);
  return `after reload + 5.5s: ${p}`;
});

await freshPage();
await check('INT-D13 no silent mock fallback: API unreachable → error screen, never a report', async () => {
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().startsWith(`${API}/api/v1/diagnosis`) ? req.abort('connectionrefused') : req.continue()));
  await fillSurvey({ withChoices: false }); await byText('진단'); await sleep(3000);
  const p = await path(); await shot('D13_network', false);
  assert(!String(p).endsWith('/result'), `reached result without backend: ${p}`);
  assert((await alertText()).length > 0, 'no alert');
  return p;
});

await freshPage();
await check('INT-D14 edge WAF 429 (plain text, no CORS headers) → "요청이 많아요" rate-limited screen, not a report', async () => {
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().startsWith(`${API}/api/v1/diagnosis`) && req.method() === 'POST'
    ? req.respond({ status: 429, contentType: 'text/plain', body: 'Too Many Requests' }) : req.continue()));
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/error', 20000); await shot('D14_waf429', false);
  const t = await text(); assert(t.includes('요청이 많아요'), 'rate-limited copy not shown');
  assert(!String(await path()).endsWith('/result'), 'reached result');
});

/* ================= PRESCRIPTION ================= */
console.log('\n[PRESCRIPTION]');
await freshPage();
await check('INT-P1 prescription with 3 insight screenshots → real HTTP → rendered result', async () => {
  await fillPrescription(); await shot('P1_input', false);
  await byText('처방'); await waitPath('/result', 60000); await shot('P1_result');
  const r = lastPresResponse(); assert(r?.status === 200 && r.body?.ok, `status ${r?.status}`);
  const d = r.body.data; const t = await text();
  const must = [d.prescription?.summary, ...(d.next_actions ?? []).map((a) => a.title)].filter(Boolean);
  const missing = must.filter((m) => !t.includes(norm(m)));
  assertEq(missing, [], 'structured fields not rendered');
  const last = await fake.last();
  const f = (last.files ?? []).filter((x) => x.field === 'insight_images');
  assert(f.length === 3 && f.every((x) => x.size_bytes <= 900000), `files ${JSON.stringify(last.files)}`);
  assertEq(last.payload?.instagram_url, 'https://www.instagram.com/reel/ABC123xyz/', 'url');
  evidence.push({ id: 'INT-P1', request_id: r.body.request_id, fake: r.fake });
  return `next_actions=${d.next_actions?.length}, files=${f.map((x) => x.size_bytes).join('/')}`;
});
await check('INT-P2 responsive prescription result @320 no overflow', async () => {
  await page.setViewport({ width: 320, height: 900 }); await sleep(200); assertEq(await noOverflow(), { doc: true, cards: true }, '@320'); await shot('P2_result_320');
});

await freshPage();
await check('INT-P3 UI blocks submit with only 2 screenshots; API rejects 2 with INVALID_IMAGE_COUNT 422', async () => {
  await fillPrescription(INSIGHTS.slice(0, 2));
  const [btn] = await page.$$('xpath/.//button[normalize-space(.)="처방"]');
  const blocked = await btn.evaluate((el) => el.disabled || el.getAttribute('aria-disabled') === 'true');
  if (!blocked) { await btn.click(); await sleep(1500); }
  const p = await path(); assert(!String(p).endsWith('/generating') && !String(p).endsWith('/result'), `advanced to ${p}`);
  const res = await directPost('prescription', { contract_version: '1.0', locale: 'ko-KR', instagram_url: 'https://www.instagram.com/reel/ABC123xyz/' },
    INSIGHTS.slice(0, 2).map((f, i) => ({ field: 'insight_images', name: `i${i}.jpg`, type: 'image/jpeg', b64: fileB64(f) })));
  assertEq([res.status, res.body?.error?.code, res.body?.error?.retryable], [422, 'INVALID_IMAGE_COUNT', false], 'api');
});
await check('INT-P4 invalid media: non-image → 415 INVALID_IMAGE_TYPE; oversize JPEG → 413 IMAGE_TOO_LARGE', async () => {
  const t = await directPost('diagnosis', { contract_version: '1.0', locale: 'ko-KR', answers: { q1_brand_name: 'x' } }, [{ field: 'product_image', name: 'a.txt', type: 'text/plain', b64: fileB64(resolve(IMG, 'not_image.txt')) }]);
  const big = await directPost('diagnosis', { contract_version: '1.0', locale: 'ko-KR', answers: { q1_brand_name: 'x' } }, [{ field: 'product_image', name: 'big.jpg', type: 'image/jpeg', b64: fileB64(resolve(IMG, 'oversize.jpg')) }]);
  assertEq([t.status, t.body?.error?.code, big.status, big.body?.error?.code], [415, 'INVALID_IMAGE_TYPE', 413, 'IMAGE_TOO_LARGE'], 'api');
  return `oversize.jpg=${statSync(resolve(IMG, 'oversize.jpg')).size} B`;
});
await check('INT-P5 UI file input rejects PDF (accept list has no pdf)', async () => {
  await page.goto(`${BASE}/survey/upload`, { waitUntil: 'networkidle0' });
  const accept = await page.$eval('input[type=file]', (el) => el.getAttribute('accept') ?? '');
  assert(!/pdf/i.test(accept) && /webp/.test(accept), `accept=${accept}`); return accept;
});
await check('INT-P6 non-reel Instagram URL (/p/) blocked client-side', async () => {
  await freshPage(); await fillPrescription(INSIGHTS, 'https://www.instagram.com/p/ABC123xyz/');
  const [btn] = await page.$$('xpath/.//button[normalize-space(.)="처방"]');
  const blocked = await btn.evaluate((el) => el.disabled || el.getAttribute('aria-disabled') === 'true');
  if (!blocked) { await btn.click(); await sleep(1500); }
  const p = await path(); assert(!String(p).endsWith('/generating') && !String(p).endsWith('/result'), `advanced to ${p}`);
});

/* ---------- Phase 2 (browser-stubbed): the fake server cannot switch inference/email on or off, so these checks stub
   only the named API responses in Chrome (request interception) and drive the real production build. ---------- */
const FIXDIR = resolve(PY, 'contracts/fixtures');
const ACAO = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Expose-Headers': 'X-Request-ID' };
async function stubApi(routes) {
  const seen = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled()) return;
    const u = req.url(); const m = req.method();
    const hit = m !== 'OPTIONS' && u.startsWith(`${API}/api/v1/`) && Object.keys(routes).find((k) => u.split('?')[0].endsWith(k));
    if (!hit) return req.continue();
    seen.push({ url: u, method: m, body: req.postData() ?? null });
    const [status, body] = routes[hit];
    req.respond({ status, headers: ACAO, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return seen;
}
const errEnv = (code, retryable) => ({ ok: false, request_id: 'stub-err', contract_version: '1.0', error: { code, message: code, retryable, details: [] } });
const diagOk = () => ({ ...JSON.parse(readFileSync(resolve(FIXDIR, 'diagnosis.success.json'), 'utf8')), delivery_token: '1789290000.0123abcd' });

await freshPage();
await check('INT-X1 SERVICE_UNAVAILABLE (503, retryable=false) → honest "준비 중" error screen, no retry button', async () => {
  const seen = await stubApi({ '/diagnosis': [503, errEnv('SERVICE_UNAVAILABLE', false)] });
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/error', 30000); await shot('X1_unavailable', false);
  const kind = await page.$eval('[data-error-kind]', (el) => el.getAttribute('data-error-kind'));
  const retry = await page.$$('xpath/.//button[normalize-space(.)="다시 시도"]');
  const t = await text();
  assertEq([kind, retry.length, t.includes('준비 중'), t.includes('그대로 남아')], ['unavailable', 0, true, true], 'unavailable UX');
  await sleep(1500); assertEq(seen.filter((r) => r.url.endsWith('/diagnosis')).length, 1, 'no automatic retry');
  await byText('입력 화면으로 돌아가기'); await waitPath('/upload');
  await page.goto(`${BASE}/survey/step/1`, { waitUntil: 'networkidle0' });
  assertEq(await page.$eval(qInput('q01'), (el) => el.value), '통합테스트 공방', 'answers kept after back');
  return t.match(/지금은[^.]*/)?.[0];
});

await freshPage();
await check('INT-X2 email enabled + delivery_token → POST /report-email {kind,report,request_id,delivery_token,email} → /delivered', async () => {
  const seen = await stubApi({ '/diagnosis': [200, diagOk()], '/features': [200, { contract_version: '1.0', email: { enabled: true, reason: null } }], '/report-email': [200, { ok: true, request_id: 'stub-mail', contract_version: '1.0', delivery_token: null, data: { status: 'duplicate' } }] });
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/result', 30000);
  await byText('진단서 받기'); await waitPath('/delivery');
  await page.waitForSelector('form[data-delivery="available"]', { timeout: 8000 });
  await page.type('input[type=email]', 'sosu@example.com'); await byText('메일로 진단서 받기'); await waitPath('/delivered', 10000); await shot('X2_delivered', false);
  const mail = seen.find((r) => r.url.endsWith('/report-email')); assert(mail, 'no report-email request');
  const b = JSON.parse(mail.body); const fx = diagOk();
  assertEq([b.kind, b.request_id, b.delivery_token, b.email, JSON.stringify(b.report) === JSON.stringify(fx.data)], ['diagnosis', fx.request_id, fx.delivery_token, 'sosu@example.com', true], 'body');
});

await freshPage();
await check('INT-X3 email disabled (features) → "준비 중" unavailable form; direct /delivered never shows success', async () => {
  const seen = await stubApi({ '/diagnosis': [200, diagOk()], '/features': [200, { contract_version: '1.0', email: { enabled: false, reason: 'disabled' } }] });
  await fillSurvey({ withChoices: false }); await byText('진단'); await waitPath('/result', 30000);
  await byText('진단서 받기'); await waitPath('/delivery');
  await page.waitForSelector('form[data-delivery="unavailable"] [data-delivery-unavailable]', { timeout: 8000 });
  await page.goto(`${BASE}/survey/delivered`, { waitUntil: 'networkidle0' }); await sleep(500);
  const p = await path(); assert(!String(p).endsWith('/delivered'), `reached ${p}`);
  assertEq(seen.filter((r) => r.url.endsWith('/report-email')).length, 0, 'no email request');
});

await browser.close();
const ok = summary();
writeFileSync(resolve(SHOTS, 'results.json'), JSON.stringify({ ok, api: API, web: BASE, evidence, at: new Date().toISOString() }, null, 2));
stopAll();
process.exit(ok ? 0 : 1);
