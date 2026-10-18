// Production smoke — NON-PAID public checks of the deployed frontend + backend. Never sends a valid generation request
// (no Gemini call): the only POSTs are an EMPTY diagnosis and a prescription with a wrong image count, both rejected
// before any model call (expected 422 INSUFFICIENT_INPUT / INVALID_* or 503 SERVICE_UNAVAILABLE).
//   BASE_URL=https://sosu-rosy.vercel.app API=https://sosu-py.vercel.app npm run smoke:prod
// Results: scripts/shots/prod-smoke/results.json (+ screenshots). Exit 1 if any check fails.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, createSuite, assert } from './lib/harness.mjs';

const BASE = (process.env.BASE_URL ?? 'https://sosu-rosy.vercel.app').replace(/\/+$/, '');
const API = (process.env.API ?? 'https://sosu-py.vercel.app').replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const OUT = resolve(import.meta.dirname, 'shots/prod-smoke');
mkdirSync(OUT, { recursive: true });

const results = { started_at: new Date().toISOString(), base: BASE, api: API, checks: {} };
const rec = (k, v) => { results.checks[k] = v; return v; };
const { check, summary } = createSuite('prod-smoke');
const getJson = async (url, init) => { const r = await fetch(url, init); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch { /* not JSON */ } return { status: r.status, headers: Object.fromEntries(r.headers), body, text: body ? undefined : text.slice(0, 300) }; };

await check('API GET /api/v1/health', async () => {
  const r = await getJson(`${API}/api/v1/health`);
  rec('health', { status: r.status, body: r.body ?? r.text, x_sosu_build: r.headers['x-sosu-build'] ?? null });
  assert(r.status === 200, `status ${r.status}`);
  return JSON.stringify(r.body);
});

await check('API GET /api/v1/features (flags recorded)', async () => {
  const r = await getJson(`${API}/api/v1/features`);
  const b = r.body ?? {};
  rec('features', { status: r.status, inference: b.inference ?? null, email: b.email ?? null, image_storage: b.image_storage ?? null, research: b.research ?? null, knowledge_version: b.knowledge_version ?? null, build: b.build ?? null, contract_version: b.contract_version ?? null, raw: r.body ?? r.text });
  assert(r.status === 200 && r.body, `status ${r.status}`);
  return `inference=${b.inference?.enabled} email=${b.email?.enabled} knowledge=${b.knowledge_version} build=${b.build}`;
});

await check(`CORS preflight from ${ORIGIN} → POST /api/v1/diagnosis`, async () => {
  const r = await fetch(`${API}/api/v1/diagnosis`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-request-id' } });
  const allow = r.headers.get('access-control-allow-origin');
  rec('cors_preflight', { status: r.status, allow_origin: allow, allow_methods: r.headers.get('access-control-allow-methods'), allow_headers: r.headers.get('access-control-allow-headers'), body: (await r.text()).slice(0, 200) });
  assert(r.status >= 200 && r.status < 300 && (allow === ORIGIN || allow === '*'), `status ${r.status} allow-origin=${allow}`);
  return `allow-origin=${allow}`;
});
await check(`CORS preflight from ${ORIGIN} → POST /api/v1/report-email (JSON + X-Request-ID)`, async () => {
  const r = await fetch(`${API}/api/v1/report-email`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-request-id' } });
  const allow = r.headers.get('access-control-allow-origin');
  rec('cors_preflight_report_email', { status: r.status, allow_origin: allow, allow_headers: r.headers.get('access-control-allow-headers') });
  assert(r.status >= 200 && r.status < 300 && (allow === ORIGIN || allow === '*'), `status ${r.status} allow-origin=${allow}`);
  return `allow-origin=${allow}`;
});

// Only invalid inputs — rejected before any model call.
const form = (payload, files = []) => { const f = new FormData(); f.append('payload', JSON.stringify(payload)); for (const [n, b] of files) f.append(n, b, `x.png`); return f; };
const PNG = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' });
await check('API POST empty diagnosis → 422 INSUFFICIENT_INPUT | 503 SERVICE_UNAVAILABLE (no model call)', async () => {
  const r = await getJson(`${API}/api/v1/diagnosis`, { method: 'POST', headers: { Origin: ORIGIN }, body: form({ contract_version: '1.0', locale: 'ko-KR', answers: {} }) });
  const code = r.body?.error?.code;
  rec('empty_diagnosis', { status: r.status, code, retryable: r.body?.error?.retryable, allow_origin: r.headers['access-control-allow-origin'] ?? null });
  assert((r.status === 422 && code === 'INSUFFICIENT_INPUT') || (r.status === 503 && code === 'SERVICE_UNAVAILABLE'), `${r.status} ${code}`);
  return `${r.status} ${code}`;
});
await check('API POST prescription with 2 images → 422 | 503 (no model call)', async () => {
  const r = await getJson(`${API}/api/v1/prescription`, { method: 'POST', headers: { Origin: ORIGIN }, body: form({ contract_version: '1.0', locale: 'ko-KR', instagram_url: 'https://www.instagram.com/reel/SMOKE_TEST/' }, [['insight_images', PNG], ['insight_images', PNG]]) });
  const code = r.body?.error?.code;
  rec('invalid_prescription', { status: r.status, code, retryable: r.body?.error?.retryable });
  assert(r.status === 422 || (r.status === 503 && code === 'SERVICE_UNAVAILABLE'), `${r.status} ${code}`);
  return `${r.status} ${code}`;
});

const browser = await launchBrowser();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
// Defense in depth: the browser part only GETs; abort any generation POST should a page ever try one.
await page.setRequestInterception(true);
page.on('request', (req) => { if (req.method() === 'POST' && /\/api\/v1\/(diagnosis|prescription|report-email)/.test(req.url())) req.abort(); else req.continue(); });

const routes = {};
for (const route of ['/survey/step/1', '/prescription']) {
  await check(`frontend ${route} @360: loads, no overflow, no console errors`, async () => {
    const before = consoleErrors.length;
    await page.setViewport({ width: 360, height: 780 });
    const res = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
    const info = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth, scrollWidth: document.documentElement.scrollWidth, build: document.querySelector('meta[name="sosu-build"]')?.content ?? null, title: document.title, hasRoot: !!document.querySelector('#root')?.children.length }));
    const errs = consoleErrors.slice(before);
    routes[route] = { status: res?.status(), ...info, console_errors: errs };
    await page.screenshot({ path: resolve(OUT, `${route.replace(/\W+/g, '_')}_360.png`), fullPage: true });
    assert(res?.status() === 200 && info.hasRoot, `status ${res?.status()} root=${info.hasRoot}`);
    assert(!info.overflow, `horizontal overflow: ${info.scrollWidth}px`);
    assert(errs.length === 0, `console errors: ${errs.join(' | ')}`);
    return `build=${info.build}`;
  });
}
rec('routes', routes);

await check('frontend <meta name="sosu-build"> present', async () => {
  const b = routes['/survey/step/1']?.build ?? null;
  rec('frontend_build', b);
  assert(b && b !== 'local', `sosu-build=${b} (old deploy without the meta, or built without VERCEL_GIT_COMMIT_SHA)`);
  return b;
});

await check(`bundle targets ${API} and contains no mock markers`, async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => new URL(m[1], BASE).href);
  let js = '';
  for (const s of srcs) js += await (await fetch(s)).text();
  const r = { scripts: srcs, has_api: js.includes(API), has_localhost_api: js.includes('127.0.0.1:8000'), markers: ['fail@', 'fixture=long', 'fixture'].filter((m) => js.includes(m)) };
  rec('bundle', r);
  assert(srcs.length > 0, 'no module script in index.html');
  assert(r.has_api, `bundle does not reference ${API}`);
  assert(!r.markers.includes('fail@') && !r.markers.includes('fixture=long'), `mock markers in bundle: ${r.markers}`);
  return `${srcs.length} script(s), localhost=${r.has_localhost_api}`;
});

await browser.close();
const ok = summary();
results.finished_at = new Date().toISOString();
results.passed = ok;
writeFileSync(resolve(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`results → ${resolve(OUT, 'results.json')}`);
process.exit(ok ? 0 : 1);
