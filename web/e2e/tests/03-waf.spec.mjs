// WAF phase — only EMPTY diagnosis submits (422 before any model call, so a WAF miss can never be billed).
// Vercel rule: 3 req / 60 s / IP (fixed window, diagnosis+prescription combined). Expect 422 ×3, then the edge 429
// surfaces as "요청이 많아요". Fixed-window boundaries can shift the count, so up to 6 submits are allowed.
import { test, expect } from '@playwright/test';
import { SHOTS, guard, sentIn, record, appPath, btn } from './lib.mjs';

test.skip(process.env.SOSU_E2E_WAF !== '1', 'uses the shared per-IP WAF window: set SOSU_E2E_WAF=1');
test.setTimeout(150_000);
test('WAF: empty submits → 422 INSUFFICIENT_INPUT, then edge 429 → "요청이 많아요" screen', async ({ page, context }) => {
  await guard(context, 'waf');
  const statuses = [];
  page.on('requestfailed', (r) => { if (/\/api\/v1\/diagnosis/.test(r.url())) statuses.push(`failed:${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (/\/api\/v1\/diagnosis/.test(r.url()) && r.request().method() === 'POST') statuses.push(r.status()); });
  await page.waitForTimeout(65_000); // fresh fixed window after the paid phase
  let limited = false;
  for (let i = 0; i < 6 && !limited; i++) {
    await page.goto('/survey/upload');
    await btn(page, '진단').click();
    await expect.poll(async () => { const p = await appPath(page); return /\/survey\/(upload|step\/\d|error)$/.test(p) && !p.endsWith('/generating') ? p : null; }, { timeout: 20_000 }).not.toBeNull();
    await page.waitForTimeout(1200);
    const p = await appPath(page);
    if (p.endsWith('/error')) limited = true;
    else await expect(page.locator('[data-input-error="survey"]')).toBeVisible();
  }
  record('waf', { statuses, sent: sentIn('waf').length });
  await page.screenshot({ path: `${SHOTS}/waf_rate_limited.png` });
  expect(limited).toBe(true);
  await expect(page.locator('[data-error-kind]')).toHaveAttribute('data-error-kind', 'rate-limited');
  await expect(btn(page, '다시 시도')).toBeVisible();
  const ok422 = statuses.filter((s) => s === 422).length;
  expect(ok422).toBeGreaterThanOrEqual(1);
  expect(ok422).toBeLessThanOrEqual(3);
  expect(statuses.every((s) => s === 422 || String(s).startsWith('failed') || s === 429)).toBe(true);
});
