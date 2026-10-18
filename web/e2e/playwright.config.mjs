// Production E2E (Playwright) — runs against the DEPLOYED site, not a local build.
//   npm run e2e:prod                         → free checks only (no generation request leaves the browser)
//   SOSU_E2E_PAID=1 npm run e2e:prod         → + 1 live diagnosis and 1 live prescription (billed Gemini calls)
//   SOSU_E2E_WAF=1  npm run e2e:prod         → + edge rate-limit check (empty submits only, never billed)
// Optional: E2E_BASE_URL, E2E_API, E2E_EXPECT_FE_SHA, E2E_EXPECT_BE_BUILD. Evidence: scripts/shots/playwright-prod/.
import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '../scripts/shots/playwright-prod');
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.mjs',
  workers: 1,
  fullyParallel: false,
  retries: 0, // never auto-retry: retrying a paid test would be a second billed call
  timeout: 60_000,
  outputDir: `${OUT}/artifacts`,
  reporter: [['list'], ['json', { outputFile: `${OUT}/report.json` }], ['html', { outputFolder: `${OUT}/html`, open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://sosu-rosy.vercel.app',
    viewport: { width: 390, height: 860 },
    locale: 'ko-KR',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
