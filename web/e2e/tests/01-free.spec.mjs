// FREE phase — zero diagnosis/prescription POSTs reach the network (guard budget 0). Error states are stubbed in the
// browser with route.fulfill, so neither Gemini nor the WAF counter is touched.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API, BASE, ROOT, SHOTS, INSIGHTS, FIX, guard, sentIn, ledger, record, consoleErrors, appPath, expectPath, btn, chip, q, noOverflow, fillSurvey, fillPrescription } from './lib.mjs';

// Expected deployed SHAs are opt-in: right after a push the previous deployment is still live.
const EXPECT_FE = process.env.E2E_EXPECT_FE_SHA ?? null;
const EXPECT_BE = process.env.E2E_EXPECT_BE_BUILD ?? null;
const ACAO = { 'access-control-allow-origin': BASE, 'access-control-expose-headers': 'X-Request-ID' };
const FIXDIR = resolve(ROOT, 'SOSU_py/contracts/fixtures');
const errEnv = (code, retryable) => JSON.stringify({ ok: false, request_id: 'stub-err', contract_version: '1.0', error: { code, message: code, retryable, details: [] } });

test.beforeEach(async ({ context }, info) => {
  // Stubbed tests install their own guard with a stub; the rest get the bare guard (budget 0 → abort).
  if (!info.title.startsWith('STUB')) await guard(context, 'free');
});

test('API health + features: inference on, email/image/research off, build header consistent', async ({ request }) => {
  const h = await request.get(`${API}/api/v1/health`);
  expect(h.status()).toBe(200);
  const f = await request.get(`${API}/api/v1/features`);
  const b = await f.json();
  record('features', { ...b, x_sosu_build: f.headers()['x-sosu-build'] });
  expect(b).toMatchObject({ contract_version: '1.0', inference: { enabled: true }, email: { enabled: false }, image_storage: { enabled: false }, research: { enabled: false }, knowledge_version: 'gb2-5edea367' });
  expect(b.build).toMatch(/^[0-9a-f]{12}$/);
  expect(f.headers()['x-sosu-build']).toBe(b.build);
  if (EXPECT_BE) expect(EXPECT_BE.startsWith(b.build)).toBe(true);
});

test('CORS preflight from the production origin', async ({ request }) => {
  for (const p of ['diagnosis', 'prescription']) {
    const r = await request.fetch(`${API}/api/v1/${p}`, { method: 'OPTIONS', headers: { Origin: BASE, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-request-id' } });
    expect(r.status(), p).toBeLessThan(300);
    expect(r.headers()['access-control-allow-origin'], p).toBe(BASE);
  }
});

test('frontend build meta is a commit SHA; bundle targets prod API, no mock markers', async ({ page, request }) => {
  await page.goto('/survey/step/1');
  const meta = await page.locator('meta[name="sosu-build"]').getAttribute('content');
  record('frontend_build', meta);
  expect(meta).toMatch(/^[0-9a-f]{40}$/);
  if (EXPECT_FE) expect(meta).toBe(EXPECT_FE);
  const html = await (await request.get(`${BASE}/`)).text();
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => new URL(m[1], BASE).href);
  let js = ''; for (const s of srcs) js += await (await request.get(s)).text();
  expect(js).toContain(API);
  expect(js).not.toContain('127.0.0.1:8000');
  expect(js).not.toContain('fail@');
  expect(js).not.toContain('fixture=long');
  expect(js).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
});

const ROUTES = ['/', '/survey', '/survey/step/1', '/survey/step/2', '/survey/step/3', '/survey/upload', '/prescription', '/survey/result', '/survey/generating', '/prescription/result', '/nope'];
for (const w of [320, 390, 1440]) {
  test(`all routes @${w}: render, no horizontal overflow, no console errors`, async ({ page }) => {
    const errs = consoleErrors(page);
    await page.setViewportSize({ width: w, height: 860 });
    const landed = {};
    for (const r of ROUTES) {
      const res = await page.goto(r);
      expect(res.status(), r).toBe(200);
      await expect(page.locator('#root > *').first()).toBeVisible();
      await page.waitForTimeout(150);
      landed[r] = await appPath(page);
      expect(await noOverflow(page), `${r}@${w}`).toEqual({ doc: true, cards: true });
    }
    await page.goto('/survey/step/1'); await page.screenshot({ path: `${SHOTS}/step1_${w}.png`, fullPage: true });
    record(`routes_${w}`, landed);
    // direct entry to result/generating must never show a report without a request
    for (const r of ['/survey/result', '/survey/generating', '/prescription/result']) expect(landed[r], r).not.toMatch(/\/(result)$/);
    // unknown → /survey → SurveyEntry resumes at the current workflow step (intended)
    expect(landed['/nope']).toMatch(/^\/survey\/(step\/\d|upload)$/);
    expect(errs).toEqual([]);
  });
}

test('survey: 3 steps → upload; max-3 chips enforced; Q18 single; answers kept across back/reload', async ({ page }) => {
  await page.goto('/survey/step/1');
  await q(page, 'q01').fill('E2E 공방');
  for (const l of ['디자인', '색감', '디테일']) await chip(page, 'q06', l).click();
  await expect(page.locator('[data-q="q06"] button.chip[aria-pressed="true"]')).toHaveCount(3);
  await expect(chip(page, 'q06', '질감')).toBeDisabled(); // 4th choice locked at max 3
  await chip(page, 'q06', '색감').click(); await expect(chip(page, 'q06', '질감')).toBeEnabled();
  await chip(page, 'q06', '색감').click();
  await btn(page, '다음').click(); await expectPath(page, '/survey/step/2');
  await btn(page, '다음').click(); await expectPath(page, '/survey/step/3');
  await chip(page, 'q18', '네').click(); await chip(page, 'q18', '아니요').click();
  await expect(page.locator('[data-q="q18"] button.chip[aria-pressed="true"]')).toHaveText(['아니요']);
  await page.reload();
  await expect(page.locator('[data-q="q18"] button.chip[aria-pressed="true"]')).toHaveText(['아니요']);
  await page.goBack(); await page.goBack();
  await expectPath(page, '/survey/step/1');
  await expect(q(page, 'q01')).toHaveValue('E2E 공방');
  await page.goto('/survey/step/3'); await btn(page, '다음').click(); await expectPath(page, '/survey/upload');
  const accept = await page.locator('input[type=file]').getAttribute('accept');
  expect(accept).toMatch(/webp/); expect(accept).not.toMatch(/pdf/i);
  await page.locator('input[type=file]').setInputFiles(`${FIX}/product_mug.jpg`);
  await page.screenshot({ path: `${SHOTS}/upload_with_image.png` });
});

test('prescription input: 2 shots blocked, /p/ URL blocked, 3 shots + reel URL enabled (not submitted)', async ({ page }) => {
  await fillPrescription(page, INSIGHTS.slice(0, 2));
  await expect(btn(page, '처방')).toHaveAttribute('aria-disabled', 'true');
  await fillPrescription(page, INSIGHTS, 'https://www.instagram.com/p/ABC123xyz/');
  await expect(btn(page, '처방')).toHaveAttribute('aria-disabled', 'true');
  await fillPrescription(page);
  await expect(btn(page, '처방')).not.toHaveAttribute('aria-disabled', 'true');
  await page.screenshot({ path: `${SHOTS}/prescription_ready.png`, fullPage: true });
});

/* ---------- stubbed error states (fulfilled in the browser, never sent) ---------- */
async function stubbed(context, handler) {
  const seen = [];
  await guard(context, 'free', async (route) => { seen.push(route.request().url()); await handler(route, seen.length); return true; });
  return seen;
}
const json = (route, status, body, headers = ACAO) => route.fulfill({ status, headers, contentType: 'application/json', body });

test('STUB 503 SERVICE_UNAVAILABLE → "준비 중", no retry button, back keeps answers', async ({ page, context }) => {
  const seen = await stubbed(context, (r) => json(r, 503, errEnv('SERVICE_UNAVAILABLE', false)));
  await fillSurvey(page); await btn(page, '진단').click(); await expectPath(page, '/survey/error', 30_000);
  await expect(page.locator('[data-error-kind]')).toHaveAttribute('data-error-kind', 'unavailable');
  await expect(btn(page, '다시 시도')).toHaveCount(0);
  await page.waitForTimeout(1500); expect(seen.length).toBe(1);
  await btn(page, '입력 화면으로 돌아가기').click(); await expectPath(page, '/survey/upload');
  await page.goto('/survey/step/1'); await expect(q(page, 'q01')).toHaveValue('E2E 공방');
});

test('STUB 502 MODEL_PROVIDER_ERROR → error → 다시 시도 → fixture result rendered (9 sections)', async ({ page, context }) => {
  const ok = readFileSync(`${FIXDIR}/diagnosis.success.json`, 'utf8');
  await stubbed(context, (r, n) => (n === 1 ? json(r, 502, errEnv('MODEL_PROVIDER_ERROR', true)) : json(r, 200, ok)));
  await fillSurvey(page); await btn(page, '진단').click(); await expectPath(page, '/survey/error', 30_000);
  await expect(page.locator('[data-error-kind]')).toHaveAttribute('data-error-kind', 'error');
  await btn(page, '다시 시도').click(); await expectPath(page, '/survey/result', 30_000);
  const n = await page.locator('[data-section]').count();
  record('stub_result_sections', n);
  expect(n).toBeGreaterThanOrEqual(9);
});

test('STUB 504 MODEL_TIMEOUT → timeout copy', async ({ page, context }) => {
  await stubbed(context, (r) => json(r, 504, errEnv('MODEL_TIMEOUT', true)));
  await fillSurvey(page); await btn(page, '진단').click(); await expectPath(page, '/survey/error', 30_000);
  await expect(page.locator('[data-error-kind]')).toHaveAttribute('data-error-kind', 'timeout');
  await expect(page.getByText('오래 걸리고')).toBeVisible();
});

test('STUB edge 429 exactly like Vercel (plain text, NO CORS) → "요청이 많아요"', async ({ page, context }) => {
  await stubbed(context, (r) => r.fulfill({ status: 429, contentType: 'text/plain', body: 'Too Many Requests' }));
  await fillSurvey(page); await btn(page, '진단').click(); await expectPath(page, '/survey/error', 30_000);
  await expect(page.locator('[data-error-kind]')).toHaveAttribute('data-error-kind', 'rate-limited');
  await expect(page.getByRole('heading', { name: '요청이 많아요' })).toBeVisible();
});

test('STUB prescription 503 → "준비 중" on prescription error screen', async ({ page, context }) => {
  await stubbed(context, (r) => json(r, 503, errEnv('SERVICE_UNAVAILABLE', false)));
  await fillPrescription(page); await btn(page, '처방').click(); await expectPath(page, '/prescription/error', 30_000);
  await expect(page.locator('[data-error-kind]')).toHaveAttribute('data-error-kind', 'unavailable');
});

test('FREE phase sent 0 AI POSTs to the network', async () => {
  expect(sentIn('free')).toEqual([]);
  expect(ledger().blocked.filter((b) => b.phase === 'free')).toEqual([]);
});
