// Shared helpers for the production Playwright suite.
// Budget guard: every diagnosis/prescription POST that would leave the browser is counted in a FILE (workers restart
// after a failure, so module state is not enough). Over budget → aborted, never sent.
import { expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../..');
export const ROOT = resolve(WEB, '..');
export const API = (process.env.E2E_API ?? 'https://sosu-py.vercel.app').replace(/\/+$/, '');
export const BASE = (process.env.E2E_BASE_URL ?? 'https://sosu-rosy.vercel.app').replace(/\/+$/, '');
export const SHOTS = resolve(WEB, 'scripts/shots/playwright-prod'); // gitignored
export const FIX = resolve(import.meta.dirname, '../fixtures');
export const INSIGHTS = [1, 2, 3].map((i) => resolve(WEB, `src/assets/insight-${i}.jpg`));
mkdirSync(SHOTS, { recursive: true });

export const LEDGER = resolve(SHOTS, 'ledger.json');
export const ledger = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { sent: [], blocked: [], evidence: {} });
const save = (l) => writeFileSync(LEDGER, JSON.stringify(l, null, 2));
export const record = (key, value) => { const l = ledger(); l.evidence[key] = value; save(l); };

// phase budgets of POSTs actually allowed onto the network
export const BUDGET = { free: 0, paid: 2, waf: 6 };
const AI = /\/api\/v1\/(diagnosis|prescription)(\?|$)/;

/** Installs the guard on a context. `stub(route)` may fulfill a request (stubbed requests never reach the network). */
export async function guard(context, phase, stub) {
  await context.route(AI, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    if (stub && (await stub(route))) return;
    const l = ledger();
    const used = l.sent.filter((s) => s.phase === phase).length;
    if (used >= BUDGET[phase]) { l.blocked.push({ phase, url: req.url(), at: new Date().toISOString() }); save(l); return route.abort('blockedbyclient'); }
    l.sent.push({ phase, url: req.url(), request_id: req.headers()['x-request-id'] ?? null, at: new Date().toISOString() }); save(l);
    return route.continue();
  });
}
export const sentIn = (phase) => ledger().sent.filter((s) => s.phase === phase);

export function consoleErrors(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  return errs;
}
export const appPath = (page) => page.locator('.app').getAttribute('data-path');
export async function expectPath(page, suffix, timeout = 20_000) {
  await expect.poll(async () => { const p = await appPath(page); return p === new URL(page.url()).pathname ? p : null; }, { timeout, intervals: [200, 500, 1000] })
    .toMatch(new RegExp(`${suffix.replace(/[/]/g, '\\/')}$`));
}
export const btn = (page, name) => page.getByRole('button', { name, exact: true });
export const chip = (page, q, label) => page.locator(`[data-q="${q}"] button.chip`, { hasText: new RegExp(`^${label}$`) });
export const q = (page, id) => page.locator(`[data-q="${id}"] input, [data-q="${id}"] textarea`).first();
export async function noOverflow(page) {
  return page.evaluate(() => ({
    doc: document.documentElement.scrollWidth <= window.innerWidth,
    cards: [...document.querySelectorAll('.report-card, .card, .screen')].every((el) => el.scrollWidth <= el.clientWidth + 1),
  }));
}

/** Fills the survey; `full` = realistic answers for the paid run. Ends on /survey/upload. */
export async function fillSurvey(page, { full = false, q18 = '아니요' } = {}) {
  await page.goto('/survey/step/1');
  await q(page, 'q01').fill(full ? '모래빛 공방' : 'E2E 공방');
  if (full) {
    await q(page, 'q02').fill('식기류 (머그컵, 접시)');
    await q(page, 'q03').fill('물결무늬 청자색 머그컵');
    await q(page, 'q04').fill('도자기 (백자토, 청자 유약)');
    await q(page, 'q05').fill('손에 닿는 온기와 매일 쓰는 물건의 단단함이 좋아서');
    for (const l of ['색감', '질감', '제작 과정']) await chip(page, 'q06', l).click();
    await q(page, 'q07').fill('물레 성형 후 손으로 하나씩 물결 선을 새겨서 같은 모양이 하나도 없어요');
  }
  await btn(page, '다음').click(); await expectPath(page, '/survey/step/2');
  if (full) {
    await q(page, 'q08').fill('홈카페를 즐기는 20~30대 직장인');
    for (const l of ['나를 위해', '선물하려고']) await chip(page, 'q09', l).click();
    for (const l of ['따뜻함', '힐링']) await chip(page, 'q10', l).click();
    for (const l of ['따뜻함', '특별함']) await chip(page, 'q11', l).click();
    await q(page, 'q12').fill('너무 화려하거나 차가운 느낌');
    await q(page, 'q13').fill('물결');
  }
  await btn(page, '다음').click(); await expectPath(page, '/survey/step/3');
  if (full) {
    await q(page, 'q14').fill('손으로 새긴 물결 무늬의 결');
    await q(page, 'q15').fill('유약이 가마에서 녹으면서 색이 변하는 과정');
    for (const l of ['조회수가 안 나와요', '어떤 콘텐츠를 만들지 모르겠어요']) await chip(page, 'q16', l).click();
    await chip(page, 'q17', '완성품 위주').click();
    await chip(page, 'q18', q18).click();
    await q(page, 'q20').fill('물결 무늬를 새기는 손과 완성된 컵의 색');
  }
  await btn(page, '다음').click(); await expectPath(page, '/survey/upload');
}

export async function fillPrescription(page, files = INSIGHTS, url = 'https://www.instagram.com/reel/E2EPWTEST01/') {
  await page.goto('/prescription');
  await page.locator('input[type=url]').fill(url);
  await page.locator('input[type=file]').setInputFiles(files);
}
