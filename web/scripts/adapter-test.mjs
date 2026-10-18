// Contract adapter tests: runs src/api/{adapters,http}.ts + data/questions.ts in a real browser (Vite dev server imports TS
// directly) against the backend's frozen fixtures in SOSU_py/contracts/fixtures (read in Node, passed as data — no fs.allow change).
//   npm run test:adapter     (PORT default 5196)
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, launchBrowser, createSuite, assert, assertEq } from './lib/harness.mjs';

const FIX = resolve(import.meta.dirname, '../../SOSU_py/contracts/fixtures');
const load = (n) => JSON.parse(readFileSync(resolve(FIX, n), 'utf8'));
const fixtures = {
  diagnosis: load('diagnosis.success.json'), prescription: load('prescription.success.json'),
  diagnosisRequest: load('diagnosis.request.json'), prescriptionRequest: load('prescription.request.json'), catalog: load('ui_option_catalog.json'),
  errors: readdirSync(FIX).filter((n) => n.startsWith('error.')).map((n) => ({ name: n, body: load(n) })),
};
const STATUS = { INVALID_REQUEST: 422, INSUFFICIENT_INPUT: 422, INVALID_IMAGE_COUNT: 422, INVALID_INSTAGRAM_URL: 422, IMAGE_TOO_LARGE: 413, INVALID_IMAGE_TYPE: 415, MODEL_TIMEOUT: 504, MODEL_PROVIDER_ERROR: 502, MODEL_SCHEMA_ERROR: 502, MODEL_CONTENT_ERROR: 502, REPAIR_FAILED: 502, INTERNAL_ERROR: 500, SERVICE_UNAVAILABLE: 503, EMAIL_DELIVERY_FAILED: 502, RATE_LIMITED: 429 };

const server = await startServer('dev', { port: 5196 });
const browser = await launchBrowser();
const page = await browser.newPage();
const { check, summary } = createSuite('adapter');
await page.goto(`${server.base}/`, { waitUntil: 'networkidle0' });
await page.evaluate(async () => {
  window.m = { ...(await import('/src/api/adapters.ts')), ...(await import('/src/api/http.ts')), ...(await import('/src/api/errors.ts')), ...(await import('/src/data/questions.ts')), ...(await import('/src/api/validation.ts')) };
});
const run = (fn, ...args) => page.evaluate(fn, ...args);

await check('diagnosis.success → SurveyReport keeps every meaningful field', async () => {
  const vm = await run((d) => window.m.adaptDiagnosis(d.data), fixtures.diagnosis);
  const d = fixtures.diagnosis.data;
  assertEq(vm.brand, { name: d.brand.name, material: d.brand.material, product: d.brand.product, keywords: d.brand.keywords.join(', ') }, 'brand');
  assertEq(vm.positioning, d.positioning.summary, 'positioning.summary'); assertEq(vm.positioningRationale, d.positioning.rationale, 'positioning.rationale');
  for (const s of d.strengths) assert(vm.strengths.includes(s.title) && vm.strengths.includes(s.description), `strength missing: ${s.title}`);
  assert(vm.target.includes(d.target.summary) && vm.target.includes(d.target.description), 'target');
  assert(d.tone.keywords.every((k) => vm.tone.includes(k)) && vm.tone.includes(d.tone.description), 'tone');
  assertEq(vm.fonts, d.fonts, 'fonts incl. reason');
  const byRank = [...d.priorities].sort((a, b) => a.rank - b.rank);
  byRank.forEach((p, i) => assert(vm.priorities[i].includes(p.title) && vm.priorities[i].includes(p.description), `priority ${i + 1}`));
  d.reel_types.forEach((t, i) => assert(vm.reelTypes[i].includes(t.name) && vm.reelTypes[i].includes(t.reason), `reel type ${i}`));
  assertEq(vm.structure, [['0~3초', 'hook_0_3'], ['3~10초', 'body_3_10'], ['10~20초', 'body_10_20'], ['20~27초', 'close_20_27'], ['27~30초', 'cta_27_30']].map(([range, k]) => ({ range, guide: d.structure[k] })), 'structure');
  for (const g of d.final_guidance) assert(vm.finalGuidance.includes(g), `final_guidance missing: ${g}`);
  assertEq(vm.guidebookNote, undefined, 'guidebookNote not fabricated');
});
await check('prescription.success → PrescriptionReport keeps summary, diagnosis, 4 ordered actions, tone', async () => {
  const vm = await run((d) => window.m.adaptPrescription(d.data), fixtures.prescription);
  const d = fixtures.prescription.data;
  assert(vm.prescription.includes(d.prescription.summary) && vm.prescription.includes(d.prescription.diagnosis), 'prescription body');
  assertEq(vm.nextActions.length, 4, 'next actions');
  [...d.next_actions].sort((a, b) => a.order - b.order).forEach((a, i) => assert(vm.nextActions[i].includes(a.title) && vm.nextActions[i].includes(a.description), `action ${a.order}`));
  assert(d.tone.keywords.every((k) => vm.tone.includes(k)) && vm.tone.includes(d.tone.description), 'tone');
});
await check('success envelope parsed → data; adapters reject malformed data', async () => {
  const r = await run((env) => {
    const out = {};
    out.data = window.m.parseEnvelope(200, JSON.stringify(env)) === null ? null : 'ok';
    const grab = (f) => { try { f(); return null; } catch (e) { return { name: e.name, kind: e.kind, code: e.code }; } };
    out.missingStrengths = grab(() => window.m.adaptDiagnosis({ ...env.data, strengths: undefined }));
    out.twoPriorities = grab(() => window.m.adaptDiagnosis({ ...env.data, priorities: env.data.priorities.slice(0, 2) }));
    out.noData = grab(() => window.m.parseEnvelope(200, JSON.stringify({ ok: true, request_id: 'x' })));
    out.html = grab(() => window.m.parseEnvelope(200, '<html>oops</html>'));
    out.html502 = grab(() => window.m.parseEnvelope(502, '<html>Bad gateway</html>'));
    out.html504 = grab(() => window.m.parseEnvelope(504, '<html>Gateway timeout</html>'));
    out.okFalseNoError = grab(() => window.m.parseEnvelope(500, JSON.stringify({ ok: false })));
    return out;
  }, fixtures.diagnosis);
  assertEq(r.data, 'ok', 'success');
  const err = { name: 'ApiError', kind: 'error', code: 'MALFORMED_RESPONSE' };
  assertEq(r.missingStrengths, err, 'missing strengths'); assertEq(r.twoPriorities, err, '2 priorities'); assertEq(r.noData, err, 'ok without data');
  assertEq(r.html, err, 'non-JSON 200 is an error, not success'); assertEq(r.html502, err, 'non-JSON 502');
  assertEq(r.html504, { name: 'ApiError', kind: 'timeout', code: 'MODEL_TIMEOUT' }, 'non-JSON 504'); assertEq(r.okFalseNoError, err, 'ok:false without error');
});
await check(`all ${fixtures.errors.length} error fixtures → kind/code/retryable/request_id`, async () => {
  const r = await run((errs, status) => errs.map(({ name, body }) => { try { window.m.parseEnvelope(status[body.error.code], JSON.stringify(body)); return { name, ok: true }; } catch (e) { return { name, kind: e.kind, code: e.code, retryable: e.retryable, requestId: e.requestId, httpStatus: e.httpStatus }; } }), fixtures.errors, STATUS);
  assert(r.length >= 12, `expected ≥12 error fixtures, got ${r.length}`); // Phase 2 may add SERVICE_UNAVAILABLE / EMAIL_DELIVERY_FAILED / RATE_LIMITED
  const INPUT = ['INVALID_REQUEST', 'INSUFFICIENT_INPUT', 'INVALID_IMAGE_TYPE', 'IMAGE_TOO_LARGE', 'INVALID_IMAGE_COUNT', 'INVALID_INSTAGRAM_URL'];
  for (const [i, x] of r.entries()) {
    const b = fixtures.errors[i].body.error;
    const kind = INPUT.includes(b.code) ? 'input' : b.code === 'MODEL_TIMEOUT' ? 'timeout' : b.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : b.code === 'EMAIL_DELIVERY_FAILED' ? 'send-error' : 'error';
    assertEq({ kind: x.kind, code: x.code, retryable: x.retryable, requestId: x.requestId }, { kind, code: b.code, retryable: b.retryable, requestId: fixtures.errors[i].body.request_id }, x.name);
  }
  return r.map((x) => `${x.code}→${x.kind}`).join(' ');
});
await check('Phase 2: delivery_token parsed from success envelope (string kept, null/absent/non-string → null)', async () => {
  const r = await run((env) => {
    const f = (extra) => { const p = window.m.parseEnvelopeFull(200, JSON.stringify({ ...env, ...extra })); return { token: p.deliveryToken, rid: p.requestId, hasData: !!p.data.brand }; };
    return { str: f({ delivery_token: '1789290000.abc123' }), nul: f({ delivery_token: null }), absent: f({}), num: f({ delivery_token: 42 }), empty: f({ delivery_token: '' }), legacy: window.m.parseEnvelope(200, JSON.stringify({ ...env, delivery_token: 'x.y' })) === null };
  }, fixtures.diagnosis);
  assertEq(r.str, { token: '1789290000.abc123', rid: fixtures.diagnosis.request_id, hasData: true }, 'string token');
  for (const k of ['nul', 'absent', 'num', 'empty']) assertEq(r[k].token, null, k);
  assertEq(r.legacy, false, 'parseEnvelope still returns data');
});
await check('Phase 2: new error codes → kinds (SERVICE_UNAVAILABLE→unavailable/no-retry, EMAIL_DELIVERY_FAILED→send-error, RATE_LIMITED→rate-limited)', async () => {
  const r = await run(() => {
    const env = (code, retryable) => JSON.stringify({ ok: false, request_id: 'rid-1', contract_version: '1.0', error: { code, message: code, retryable, details: [] } });
    const grab = (status, code, retryable) => { try { window.m.parseEnvelope(status, env(code, retryable)); return null; } catch (e) { return { kind: e.kind, code: e.code, retryable: e.retryable, gen: window.m.generationErrorKind(e) }; } };
    return { su: grab(503, 'SERVICE_UNAVAILABLE', true), edf: grab(502, 'EMAIL_DELIVERY_FAILED', true), rl: grab(429, 'RATE_LIMITED', true), mt: grab(504, 'MODEL_TIMEOUT', true) };
  });
  assertEq(r.su, { kind: 'unavailable', code: 'SERVICE_UNAVAILABLE', retryable: false, gen: 'unavailable' }, 'SERVICE_UNAVAILABLE (retryable forced false)');
  assertEq(r.edf, { kind: 'send-error', code: 'EMAIL_DELIVERY_FAILED', retryable: true, gen: 'error' }, 'EMAIL_DELIVERY_FAILED');
  assertEq(r.rl, { kind: 'error', code: 'RATE_LIMITED', retryable: true, gen: 'rate-limited' }, 'RATE_LIMITED');
  assertEq(r.mt.gen, 'timeout', 'MODEL_TIMEOUT unchanged');
});
await check('Phase 2: report-email client (body shape, sent/duplicate ok, 503→unavailable, 502/422→send-error, no token→unavailable) + features gate', async () => {
  const r = await run(async () => {
    const real = window.fetch; const calls = [];
    const reply = (status, body) => { window.fetch = async (url, init) => { calls.push({ url: String(url), method: init?.method ?? 'GET', ct: init?.headers?.['Content-Type'], body: init?.body ? JSON.parse(init.body) : null }); return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }; };
    const ok = (status) => ({ ok: true, request_id: 'r2', contract_version: '1.0', delivery_token: null, data: { status } });
    const err = (code, retryable) => ({ ok: false, request_id: 'r3', contract_version: '1.0', error: { code, message: code, retryable, details: [] } });
    const t = { kind: 'diagnosis', report: { brand: { name: 'x' } }, requestId: 'req-1', token: '1789290000.deadbeef' };
    const send = async (tk = t) => { try { await window.m.sendReportEmail(' a@b.co ', tk); return 'ok'; } catch (e) { return e.kind; } };
    const out = {};
    reply(200, ok('sent')); out.sent = await send(); out.body = calls.at(-1);
    reply(200, ok('duplicate')); out.dup = await send();
    reply(200, ok('queued')); out.weird = await send();
    reply(503, err('SERVICE_UNAVAILABLE', false)); out.s503 = await send();
    reply(502, err('EMAIL_DELIVERY_FAILED', true)); out.s502 = await send();
    reply(422, err('INVALID_REQUEST', false)); out.s422 = await send();
    reply(500, '<html>'); out.html = await send();
    const before = calls.length; out.noToken = await send({ ...t, token: null }); out.noTokenFetched = calls.length !== before;
    reply(200, { contract_version: '1.0', email: { enabled: true } }); out.fOn = await window.m.emailEnabled(); out.fUrl = calls.at(-1).url;
    reply(200, { contract_version: '1.0', email: { enabled: false, reason: 'owner' } }); out.fOff = await window.m.emailEnabled();
    reply(200, { contract_version: '1.0' }); out.fUnknown = await window.m.emailEnabled();
    reply(404, { detail: 'Not Found' }); out.f404 = await window.m.emailEnabled();
    window.fetch = async () => { throw new TypeError('Failed to fetch'); }; out.fNet = await window.m.emailEnabled();
    window.fetch = real;
    return out;
  });
  assertEq(r.body.url.endsWith('/api/v1/report-email') && r.body.method === 'POST' && r.body.ct === 'application/json', true, 'endpoint/method/content-type');
  assertEq(r.body.body, { kind: 'diagnosis', report: { brand: { name: 'x' } }, request_id: 'req-1', delivery_token: '1789290000.deadbeef', email: 'a@b.co' }, 'request body');
  assertEq([r.sent, r.dup, r.weird, r.s503, r.s502, r.s422, r.html], ['ok', 'ok', 'send-error', 'unavailable', 'send-error', 'send-error', 'send-error'], 'outcomes');
  assertEq([r.noToken, r.noTokenFetched], ['unavailable', false], 'no token → unavailable without a request');
  assert(r.fUrl.endsWith('/api/v1/features'), r.fUrl);
  assertEq([r.fOn, r.fOff, r.fUnknown, r.f404, r.fNet], [true, false, false, false, false], 'features gate');
});
await check('request mapper reproduces diagnosis.request.json (field names, Q18 single, contract_version, locale)', async () => {
  const req = fixtures.diagnosisRequest;
  const built = await run((req) => {
    const inv = Object.fromEntries(Object.entries(window.m.ANSWER_FIELDS).map(([q, f]) => [f, q]));
    const ui = {};
    for (const [f, v] of Object.entries(req.answers)) { const q = inv[f]; ui[q] = f === 'q18_disclosure' ? (v ? [v] : []) : v; }
    return { built: window.m.buildDiagnosisRequest(ui), emptyQ18: window.m.toSurveyAnswers({ q18: [] }).q18_disclosure, blank: window.m.toSurveyAnswers({ q01: '  ' }) };
  }, req);
  assertEq(built.built, req, 'request'); assertEq(built.emptyQ18, null, 'Q18 none → null'); assertEq(built.blank, { q18_disclosure: null }, 'blank text omitted');
});
await check('questions.ts options == ui_option_catalog (codes, labels, selection, max)', async () => {
  const qs = await run(() => window.m.QUESTIONS.filter((q) => q.type === 'choice').map((q) => ({ id: q.id, field: window.m.ANSWER_FIELDS[q.id], selection: q.selection, max: q.maxSelection ?? null, options: q.options })));
  const cat = fixtures.catalog.questions;
  assertEq(qs.length, Object.keys(cat).length, 'choice question count');
  for (const q of qs) {
    const c = cat[`q${Number(q.id.slice(1))}`];
    assertEq({ field: q.field, selection: q.selection, max: q.max, options: q.options }, { field: c.field, selection: c.selection, max: c.max_selection, options: c.options.map(({ code, label }) => ({ code, label })) }, q.id);
  }
});
await check('legacy answers migrate (old codes → contract, unknown dropped, max enforced)', async () => {
  const r = await run(() => window.m.migrateAnswers({ q01: 'a', q06: ['scarcity', 'making_process'], q09: ['special', 'memory', 'decor', 'unique_ownership'], q16: ['filming', 'nope'], q18: ['yes', 'no'], q99: 'x' }));
  assertEq(r, { q01: 'a', q06: ['rarity', 'process'], q09: ['specialness', 'memories', 'space_decor'], q16: ['shooting_difficulty'], q18: ['yes'] }, 'migrated');
});
await check('X-Request-ID ≤ 64 chars [A-Za-z0-9._-], unique', async () => {
  const ids = await run(() => [window.m.newRequestId(), window.m.newRequestId()]);
  assert(ids.every((id) => /^[A-Za-z0-9._-]{1,64}$/.test(id)), JSON.stringify(ids)); assert(ids[0] !== ids[1], 'not unique'); return ids[0];
});
await check('Instagram URL rule mirrors backend (reel/reels only)', async () => {
  const cases = { 'https://www.instagram.com/reel/C0ffeeBeanz/': true, 'https://instagram.com/reels/abc_D-1': true, 'http://m.instagram.com/reel/x/': true, 'https://www.instagram.com/p/C0ffee/': false, 'https://www.instagram.com/reel/': false, 'https://evil.com/reel/abc': false, 'https://www.instagram.com/reel/abc/extra': false, 'ftp://instagram.com/reel/abc': false, 'not a url': false };
  const r = await run((c) => Object.fromEntries(Object.keys(c).map((u) => [u, window.m.isValidInstagramUrl(u)])), cases);
  assertEq(r, cases, 'urls');
  assertEq(await run((u) => window.m.isValidInstagramUrl(u), fixtures.prescriptionRequest.instagram_url), true, 'fixture url');
});

await browser.close();
server.stop();
process.exit(summary() ? 0 : 1);
