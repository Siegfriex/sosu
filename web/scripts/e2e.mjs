// Regression suite (HANDOFF §8-5): drives every workflow state against the production build with the system Chrome.
//   npm run e2e            → builds, serves on :5199, runs, exits 1 on any failed check
//   BASE_URL=... npm run e2e → reuse a running server
// Screenshots land in scripts/shots/ (gitignored). Mock API only — no Gemini / Python service is called.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, launchBrowser, createSuite, assert, assertEq } from './lib/harness.mjs';

mkdirSync('scripts/shots', { recursive: true });
const server = await startServer('preview');
const base = server.base;
const browser = await launchBrowser();
const page = await browser.newPage();
const { check, summary } = createSuite('e2e');

const fontRequests = [];
page.on('response', (r) => { const u = r.url(); if (/\.woff2?(\?|$)/.test(u) || /fonts\.(gstatic|googleapis)\.com|cdn\.jsdelivr\.net/.test(u)) fontRequests.push(`${r.status()} ${u}`); });

const INSIGHTS = [1, 2, 3].map((i) => resolve(`src/assets/insight-${i}.jpg`));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name, full = true) => { await page.screenshot({ path: `scripts/shots/${name}.png`, fullPage: full }); };
// Router navigation is a React transition: the URL changes before the screen commits, so wait for the committed screen (data-path).
const waitPath = (test, timeout = 15000) => page.waitForFunction((t) => { const p = document.querySelector('.app')?.getAttribute('data-path') ?? ''; return p === location.pathname && (t.startsWith('=') ? p === t.slice(1) : p.endsWith(t)); }, { timeout }, test);
const byText = async (text, tag = 'button') => { const xp = `xpath/.//${tag}[normalize-space(.)="${text}"]`; await page.waitForSelector(xp, { visible: true, timeout: 5000 }); const [h] = await page.$$(xp); await h.click(); };
const chipEl = (label) => page.$(`xpath/.//button[contains(@class,"chip") and normalize-space(.)="${label}"]`);
const chipAttr = async (label, attr) => (await chipEl(label)).evaluate((el, a) => (a === 'disabled' ? String(el.disabled) : el.getAttribute(a)), attr);
const storage = (key) => page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) ?? 'null'), key);
const qInput = (id) => `[data-q="${id}"] input, [data-q="${id}"] textarea`;
const noHorizontalOverflow = () => page.evaluate(() => ({ doc: document.documentElement.scrollWidth <= window.innerWidth, cards: [...document.querySelectorAll('.report-card, .card, .screen')].every((el) => el.scrollWidth <= el.clientWidth + 1) }));

await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => { const st = document.createElement('style'); st.textContent = '.header{position:static !important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });

/* ================= FONT ================= */
console.log('\n[FONT]');
await page.goto(`${base}/survey/step/1`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await check('SUITE woff2 served 200 from same origin', async () => {
  const hit = fontRequests.find((r) => r.includes('/fonts/SUITE-Variable') && r.startsWith('200'));
  assert(hit, `font requests: ${JSON.stringify(fontRequests)}`);
  return hit;
});
await check('document.fonts.check 400/600/700 all true', async () => {
  const r = await page.evaluate(() => [400, 600, 700].map((w) => document.fonts.check(`${w} 13px SUITE`)));
  assertEq(r, [true, true, true], 'weights');
});
await check('computed body family starts with SUITE', async () => {
  const f = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  assert(/^SUITE\b/.test(f), f); return f;
});
await check('zero CDN font requests (jsdelivr / googleapis / gstatic)', async () => {
  const cdn = fontRequests.filter((r) => /jsdelivr|googleapis|gstatic/.test(r));
  assertEq(cdn, [], 'cdn requests');
});
await check('Noto Sans KR never fetched (SUITE covers all glyphs)', async () => {
  const noto = await page.evaluate(() => [...document.fonts].filter((f) => f.family.includes('Noto')).map((f) => f.status));
  assert(!noto.includes('loaded'), `Noto statuses: ${JSON.stringify(noto)}`);
});
await check('document.title reflects workflow', async () => assertEq(await page.title(), 'SOSU | 문진표', 'title'));
await shot('00_font_step1');

/* ================= MAIN: survey 1→2→3→upload ================= */
console.log('\n[MAIN]');
await check('a11y: tabs = tablist/tab/aria-selected', async () => {
  const r = await page.evaluate(() => ({ list: !!document.querySelector('[role=tablist]'), tabs: [...document.querySelectorAll('[role=tab]')].map((t) => t.getAttribute('aria-selected')) }));
  assertEq(r, { list: true, tabs: ['true', 'false'] }, 'tabs');
});
await check('a11y: chips are buttons with aria-pressed, group describes selection mode', async () => {
  const r = await page.evaluate(() => {
    const g = document.querySelector('[data-q=q06] [role=group]');
    const chips = [...g.querySelectorAll('button.chip')];
    return { n: chips.length, pressed: chips.every((c) => c.hasAttribute('aria-pressed')), mode: document.getElementById(g.getAttribute('aria-describedby'))?.textContent, labelled: !!g.getAttribute('aria-labelledby') };
  });
  assertEq(r, { n: 9, pressed: true, mode: '최대 3개 선택', labelled: true }, 'chip group');
});
await check('a11y: text question input labelled by its question label', async () => {
  const r = await page.evaluate(() => { const i = document.querySelector('[data-q=q01] input'); return document.getElementById(i.getAttribute('aria-labelledby'))?.textContent?.startsWith('1.'); });
  assert(r, 'aria-labelledby missing');
});
await page.type(qInput('q01'), '반짝이는 모든 것들');
await page.type(qInput('q04'), '유리, 도자');
for (const t of ['디자인', '색감', '디테일']) await (await chipEl(t)).click();
await check('Q6 max 3: 4th chip disabled + status announced; state stores codes', async () => {
  assertEq(await chipAttr('질감', 'disabled'), 'true', '4th chip disabled');
  const status = await page.evaluate(() => document.querySelector('[data-q=q06] [role=status]')?.textContent);
  assert(status?.includes('3개'), `status: ${status}`);
  assertEq((await storage('sosu.survey.v2')).answers.q06, ['design', 'color', 'detail'], 'q06 codes');
});
await check('keyboard: Space toggles a chip', async () => {
  await (await chipEl('디테일')).focus(); await page.keyboard.press('Space'); await pause(50);
  assertEq(await chipAttr('디테일', 'aria-pressed'), 'false', 'unpressed');
  assertEq(await chipAttr('질감', 'disabled'), 'false', 're-enabled');
  await (await chipEl('디테일')).focus(); await page.keyboard.press('Enter'); await pause(50);
  assertEq(await chipAttr('디테일', 'aria-pressed'), 'true', 'Enter re-pressed');
});
await shot('01_step1_filled');
await byText('다음'); await waitPath('/step/2'); await shot('02_step2');
await check('step 2 → progress dot 2', async () => assertEq(await page.$eval('.progress', (el) => el.getAttribute('aria-label')), '4단계 중 2단계', 'progress'));
await byText('다음'); await waitPath('/step/3'); await shot('03_step3');
await check('Q18 single: second pick replaces first; code stored', async () => {
  await (await chipEl('네')).click(); await (await chipEl('아니요')).click(); await pause(50);
  assertEq([await chipAttr('네', 'aria-pressed'), await chipAttr('아니요', 'aria-pressed')], ['false', 'true'], 'single');
  assertEq((await storage('sosu.survey.v2')).answers.q18, ['no'], 'q18 code');
});
await byText('다음'); await waitPath('/upload'); await shot('04_upload', false);
await check('upload: dropzone is single keyboard tab stop, hidden input labelled', async () => {
  const r = await page.evaluate(() => ({ dz: document.querySelector('.dropzone')?.getAttribute('role'), tab: document.querySelector('input[type=file]')?.tabIndex, label: document.querySelector('input[type=file]')?.getAttribute('aria-label') }));
  assertEq(r, { dz: 'button', tab: -1, label: '파일 선택' }, 'uploader');
});

/* ================= PRESCRIPTION input + lightbox, survey draft survives ================= */
console.log('\n[PRESCRIPTION input]');
await byText('처방전'); await waitPath('=/prescription');
await check('document.title switches to 처방전', async () => assertEq(await page.title(), 'SOSU | 처방전', 'title'));
await page.type('input[type=url]', 'https://www.instagram.com/reel/ABC123/');
await check('URL valid mark shown for instagram.com', async () => assert(await page.$('.field__mark'), 'no valid mark'));
await check('처방 disabled until 3 images', async () => assertEq(await page.$eval('.btn--primary', (b) => b.getAttribute('aria-disabled')), 'true', 'disabled'));
const fileInput = await page.$('input[type=file]');
await fileInput.uploadFile(...INSIGHTS);
await check('3 image slots filled → 처방 enabled', async () => {
  await page.waitForFunction(() => document.querySelectorAll('.file-item').length === 3, { timeout: 3000 });
  assertEq(await page.$eval('.btn--primary', (b) => b.getAttribute('aria-disabled')), 'false', 'enabled');
});
await shot('08_prescription_input');
await page.click('.thumb'); await page.waitForSelector('.lightbox');
await check('lightbox: dialog/aria-modal, focus moves to close, scroll locked', async () => {
  const r = await page.evaluate(() => ({ role: document.querySelector('.lightbox')?.getAttribute('role'), modal: document.querySelector('.lightbox')?.getAttribute('aria-modal'), focus: document.activeElement?.className, locked: document.body.hasAttribute('data-scroll-locked') }));
  assertEq(r, { role: 'dialog', modal: 'true', focus: 'lightbox__close t-body', locked: true }, 'lightbox');
});
await shot('09_lightbox', false);
await check('lightbox: Tab is trapped', async () => { await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); assertEq(await page.evaluate(() => document.activeElement?.className), 'lightbox__close t-body', 'focus'); });
await check('lightbox: ESC closes + focus restored to trigger + scroll unlocked', async () => {
  await page.keyboard.press('Escape'); await page.waitForSelector('.lightbox', { hidden: true });
  const r = await page.evaluate(() => ({ focus: document.activeElement?.className, locked: document.body.hasAttribute('data-scroll-locked') }));
  assertEq(r, { focus: 'thumb', locked: false }, 'after ESC');
});
await check('lightbox: backdrop click closes', async () => {
  await page.click('.thumb'); await page.waitForSelector('.lightbox');
  await page.mouse.click(4, 4); await page.waitForSelector('.lightbox', { hidden: true });
});
await byText('문진표'); await waitPath('/upload');
await check('tab round-trip keeps survey draft and returns to current step', async () => {
  const s = await storage('sosu.survey.v2'); assertEq(s.answers.q01, '반짝이는 모든 것들', 'q01'); assertEq(s.status, 'UPLOAD', 'status');
});

/* ================= MAIN: generating → result → delivery → delivered → reset ================= */
console.log('\n[MAIN generating…delivered]');
await byText('진단'); await waitPath('/generating');
await pause(900);
await check('generating: tabs locked, live status text, no percentage', async () => {
  const r = await page.evaluate(() => ({ locked: [...document.querySelectorAll('[role=tab]')].every((t) => t.getAttribute('aria-disabled') === 'true'), status: document.querySelector('.staged [role=status]')?.textContent, pct: /\d+\s*%/.test(document.body.innerText) }));
  assert(r.locked, 'tabs not locked'); assert(r.status, 'no status'); assert(!r.pct, 'percentage text found'); return r.status;
});
await shot('05_generating', false);
await waitPath('/result');
await shot('06_result');
await byText('진단서 받기'); await waitPath('/delivery'); await shot('07_delivery', false);
await page.type('input[type=email]', 'sosu@gmail');
await page.keyboard.press('Enter'); await pause(200);
await check('delivery: invalid email → aria-invalid + alert', async () => {
  const r = await page.evaluate(() => ({ inv: document.querySelector('input[type=email]')?.getAttribute('aria-invalid'), alert: document.querySelector('.field__error[role=alert]')?.textContent }));
  assertEq(r.inv, 'true', 'aria-invalid'); assert(r.alert, 'no alert');
});
await shot('07b_delivery_invalid', false);
await page.click('input[type=email]', { clickCount: 3 }); await page.type('input[type=email]', 'sosu@gmail.com');
await byText('메일로 진단서 받기'); await pause(300); await shot('07c_delivery_submitting', false);
await waitPath('/delivered'); await shot('07d_delivered', false);
await byText('첫 화면으로 돌아가기'); await waitPath('/step/1');
await check('survey reset clears survey only; prescription draft intact', async () => {
  await page.waitForSelector(qInput('q01'));
  assertEq(await page.$eval(qInput('q01'), (el) => el.value), '', 'q01 cleared');
  const p = await storage('sosu.prescription.v2');
  assertEq(p.url, 'https://www.instagram.com/reel/ABC123/', 'prescription url kept'); assertEq(p.files.length, 3, 'prescription files kept');
});

/* ================= PRESCRIPTION: generating → result → delivery → delivered → reset ================= */
console.log('\n[PRESCRIPTION generating…delivered]');
await page.type(qInput('q01'), '두번째 브랜드'); // survey draft that must survive a prescription reset
await byText('처방전'); await waitPath('=/prescription');
await byText('처방'); await waitPath('/generating');
await pause(600); await shot('P2_generating', false);
await waitPath('/result'); await shot('P3_result');
await byText('처방전 받기'); await waitPath('/delivery');
await page.type('input[type=email]', 'sosu@gmail.com');
await byText('메일로 처방전 받기'); await waitPath('/delivered'); await shot('P5_delivered', false);
await byText('첫 화면으로 돌아가기'); await waitPath('=/prescription');
await check('prescription reset clears prescription only; survey draft intact', async () => {
  assertEq(await page.$eval('input[type=url]', (el) => el.value), '', 'url cleared');
  assertEq(await page.$$eval('.file-item', (els) => els.length), 0, 'files cleared');
  assertEq((await storage('sosu.survey.v2')).answers.q01, '두번째 브랜드', 'survey draft kept');
});

/* ================= ERROR paths ================= */
console.log('\n[ERROR]');
for (const [wf, kind, text] of [['survey', 'error', '완료하지 못했어요'], ['survey', 'timeout', '오래 걸리고'], ['prescription', 'error', '완료하지 못했어요'], ['prescription', 'timeout', '오래 걸리고']]) {
  await check(`${wf} ?fail=${kind} → error screen announced (role=alert) with ${kind} copy`, async () => {
    await page.goto(`${base}/${wf}/generating?fail=${kind}`, { waitUntil: 'networkidle0' });
    await waitPath('/error');
    const r = await page.evaluate(() => ({ alert: !!document.querySelector('.state--error[role=alert]'), h: document.querySelector('.state--error h2')?.textContent }));
    assert(r.alert, 'no role=alert'); assert(r.h?.includes(text), `heading: ${r.h}`);
    await shot(`E_${wf}_${kind}`, false);
  });
}
await check('error → 다시 시도 re-enters generating with draft and succeeds', async () => {
  await page.goto(`${base}/survey/generating?fail=error`, { waitUntil: 'networkidle0' }); await waitPath('/error');
  await byText('다시 시도'); await waitPath('/generating'); await waitPath('/result');
});

/* ================= LONG-CONTENT layout QA ================= */
console.log('\n[LONG CONTENT]');
for (const wf of ['survey', 'prescription']) {
  await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${base}/${wf}/generating?fixture=long`, { waitUntil: 'networkidle0' }); await waitPath('/result');
  for (const w of [320, 430, 1440]) {
    await check(`${wf} long fixture @${w}: no horizontal overflow / clipping`, async () => {
      await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
      await page.goto(`${base}/${wf}/result`, { waitUntil: 'networkidle0' }); await waitPath('/result');
      const r = await noHorizontalOverflow(); assertEq(r, { doc: true, cards: true }, 'overflow');
      const clipped = await page.evaluate(() => [...document.querySelectorAll('.report-card__body')].some((el) => el.scrollHeight > el.clientHeight + 1));
      assert(!clipped, 'report body clipped');
      if (w === 1440) { const left = await page.$eval('.screen', (el) => el.getBoundingClientRect().left); assert(Math.abs(left - (1440 - 430) / 2) < 2, `not centered: left=${left}`); }
      await shot(`L_${wf}_${w}`, w < 1000);
    });
  }
}

/* ================= RESPONSIVE ================= */
console.log('\n[RESPONSIVE]');
for (const w of [320, 360, 390, 430, 1440]) {
  await check(`survey step 1 @${w}: renders without horizontal overflow`, async () => {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${base}/survey/step/1`, { waitUntil: 'networkidle0' });
    const r = await noHorizontalOverflow(); assertEq(r, { doc: true, cards: true }, 'overflow');
    const chipsPerRow = await page.evaluate(() => { const c = [...document.querySelectorAll('[data-q=q06] .chip')]; const top = c[0].getBoundingClientRect().top; return c.filter((el) => Math.abs(el.getBoundingClientRect().top - top) < 1).length; });
    assertEq(chipsPerRow, 3, 'grid3 chips per row');
    await shot(`R_${w}`, w < 1000);
  });
}
await check('prescription input @320: renders without horizontal overflow', async () => {
  await page.setViewport({ width: 320, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/prescription`, { waitUntil: 'networkidle0' });
  assertEq(await noHorizontalOverflow(), { doc: true, cards: true }, 'overflow'); await shot('R_320_prescription');
});

await browser.close();
server.stop();
process.exit(summary() ? 0 : 1);
