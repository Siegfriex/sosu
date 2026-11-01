// PAID phase — exactly 2 live generations (guard budget 2): diagnosis WITH product image + Q18='아니요', then one
// prescription with 3 insight screenshots. Serial: if diagnosis fails, nothing else is sent. Never clicks 다시 시도.
import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { API, ROOT, SHOTS, FIX, guard, sentIn, record, consoleErrors, expectPath, btn, noOverflow, fillSurvey, fillPrescription } from './lib.mjs';

test.skip(process.env.SOSU_E2E_PAID !== '1', 'billed: set SOSU_E2E_PAID=1 to run 2 live generations');
test.describe.configure({ mode: 'serial', timeout: 240_000 });
const PY = resolve(ROOT, 'SOSU_py/.venv/bin/python'); // runs the backend's own Q18 checker
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

const capture = (page, endpoint) => page.waitForResponse((r) => r.url().startsWith(`${API}/api/v1/${endpoint}`) && r.request().method() === 'POST', { timeout: 200_000 });

test('LIVE diagnosis with product image, Q18=아니요 → 200, rendered, request_id echoed, Q18 respected', async ({ page, context }) => {
  await guard(context, 'paid');
  const errs = consoleErrors(page);
  await fillSurvey(page, { full: true, q18: '아니요' });
  await page.locator('input[type=file]').setInputFiles(`${FIX}/product_mug.jpg`);
  const t0 = Date.now();
  const resP = capture(page, 'diagnosis');
  await btn(page, '진단').click();
  await expectPath(page, '/survey/generating');
  const res = await resP;
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => null);
  const sentId = res.request().headers()['x-request-id'];
  writeFileSync(`${SHOTS}/live_diagnosis.json`, JSON.stringify(body, null, 2));
  record('live_diagnosis', { status: res.status(), ms, request_id: body?.request_id, sent_request_id: sentId, x_sosu_build: res.headers()['x-sosu-build'], error: body?.error ?? null });
  expect(res.status(), JSON.stringify(body?.error)).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.request_id).toBe(sentId);
  await expectPath(page, '/survey/result', 30_000);
  await page.screenshot({ path: `${SHOTS}/live_diagnosis_390.png`, fullPage: true });

  const d = body.data; const text = norm(await page.locator('body').innerText());
  const must = [d.positioning?.summary, ...(d.strengths ?? []).map((s) => s.title), ...(d.final_guidance ?? []).slice(0, 1)].filter(Boolean);
  expect(must.filter((m) => !text.includes(norm(m)))).toEqual([]);
  const sections = await page.locator('[data-section]').count();
  record('live_diagnosis_sections', sections);
  expect(sections).toBeGreaterThanOrEqual(9);
  expect(text).toContain('모래빛 공방');

  const q18 = JSON.parse(execFileSync(PY, ['-I', `${import.meta.dirname}/q18_check.py`, `${SHOTS}/live_diagnosis.json`]).toString());
  record('live_diagnosis_q18', q18);
  expect(q18.violations).toEqual([]);

  for (const w of [320, 1440]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(200); expect(await noOverflow(page), `@${w}`).toEqual({ doc: true, cards: true }); await page.screenshot({ path: `${SHOTS}/live_diagnosis_${w}.png`, fullPage: true }); }
  await page.setViewportSize({ width: 390, height: 860 });

  // guidebook reel types: combination line, axis labels, guidebook note; (qN) markers moved to 근거 질문 footnotes
  const reel = page.locator('[data-section="reelTypes"]');
  await expect(reel).toContainText(/추천 조합 · [AB] \+ [CD] \+ [EF]/);
  await expect(reel).toContainText("*릴스 유형은 가이드북 2장 '실전 릴스 유형' 참고");
  await expect(reel).not.toContainText('나레이션'); // Q18=아니요 → voice-free labels
  expect(text).not.toMatch(/\([qQ]\s*\d{1,2}/);
  const notes = await page.locator('[data-evidence]').count();
  record('live_diagnosis_evidence_notes', notes);
  expect(notes).toBeGreaterThanOrEqual(1);

  // email: production state decides. Enabled → send only when SOSU_E2E_EMAIL_TO is set (1 real e-mail).
  const features = await (await page.request.get(`${API}/api/v1/features`)).json();
  record('features_email', features.email);
  await btn(page, '진단서 받기').click(); await expectPath(page, '/survey/delivery');
  if (!features.email?.enabled) {
    await expect(page.locator('form[data-delivery="unavailable"] [data-delivery-unavailable]')).toBeVisible({ timeout: 10_000 });
    await page.goto('/survey/delivered'); await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).not.toMatch(/delivered$/);
  } else {
    await expect(page.locator('form[data-delivery="available"]')).toBeVisible({ timeout: 10_000 });
    if (features.guidebook?.enabled) await expect(page.locator('[data-delivery-guidebook]')).toBeVisible();
    const to = process.env.SOSU_E2E_EMAIL_TO;
    if (to) {
      await page.getByLabel('이메일 주소').fill(to);
      const mailP = page.waitForResponse((r) => r.url().startsWith(`${API}/api/v1/report-email`) && r.request().method() === 'POST', { timeout: 60_000 });
      await btn(page, '메일로 진단서 받기').click();
      const mail = await mailP;
      const mb = await mail.json().catch(() => null);
      record('live_report_email', { status: mail.status(), data: mb?.data ?? null, error: mb?.error ?? null });
      expect(mail.status(), JSON.stringify(mb?.error)).toBe(200);
      expect(['sent', 'duplicate']).toContain(mb.data.status);
      await expectPath(page, '/survey/delivered', 20_000);
    }
  }
  await page.screenshot({ path: `${SHOTS}/live_delivery.png` });
  expect(errs).toEqual([]);
});

test('LIVE prescription with 3 insight screenshots → 200, rendered, no URL-slug leakage', async ({ page, context }) => {
  await guard(context, 'paid');
  const errs = consoleErrors(page);
  await fillPrescription(page); // reel URL slug E2EPWTEST01
  const t0 = Date.now();
  const resP = capture(page, 'prescription');
  await btn(page, '처방').click();
  const res = await resP;
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => null);
  const sentId = res.request().headers()['x-request-id'];
  writeFileSync(`${SHOTS}/live_prescription.json`, JSON.stringify(body, null, 2));
  record('live_prescription', { status: res.status(), ms, request_id: body?.request_id, sent_request_id: sentId, x_sosu_build: res.headers()['x-sosu-build'], error: body?.error ?? null });
  expect(res.status(), JSON.stringify(body?.error)).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.request_id).toBe(sentId);
  await expectPath(page, '/prescription/result', 30_000);
  await page.screenshot({ path: `${SHOTS}/live_prescription_390.png`, fullPage: true });
  const d = body.data; const text = norm(await page.locator('body').innerText());
  const must = [d.prescription?.summary, ...(d.next_actions ?? []).map((a) => a.title)].filter(Boolean);
  expect(must.length).toBeGreaterThan(1);
  expect(must.filter((m) => !text.includes(norm(m)))).toEqual([]);
  expect(JSON.stringify(d)).not.toMatch(/E2EPWTEST01/i);
  await page.setViewportSize({ width: 320, height: 900 }); await page.waitForTimeout(200);
  expect(await noOverflow(page)).toEqual({ doc: true, cards: true });
  await btn(page, '처방전 받기').click(); await expectPath(page, '/prescription/delivery');
  const pf = await (await page.request.get(`${API}/api/v1/features`)).json();
  await expect(page.locator(`form[data-delivery="${pf.email?.enabled ? 'available' : 'unavailable'}"]`)).toBeVisible({ timeout: 10_000 });
  expect(errs).toEqual([]);
});

test('PAID phase used exactly 2 network POSTs', async () => {
  expect(sentIn('paid').length).toBe(2);
});
