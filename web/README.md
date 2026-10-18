# SOSU web

Vite 8 + React 19 + TypeScript + react-router 7. Production: <https://sosu-rosy.vercel.app> (Vercel project root `web/`).
Design source of truth: the Figma file `ejRfXQERdNsBWbKYEdemRB`, pages `00_Foundations` … `06_Handoff`.

```bash
npm install
npm run dev                 # http://localhost:5173 — talks to VITE_API_BASE_URL (default http://127.0.0.1:8000)
VITE_API_MODE=mock npm run dev   # offline UI with the in-browser mock
```

## Structure

| Path | Role |
|---|---|
| `src/api/` | `client.ts` is the only API entry point for screens: `http` by default, `mock` only when `VITE_API_MODE=mock`. `http.ts` handles multipart and envelope parsing, `adapters.ts` maps the contract to view models, `errors.ts` defines typed `ApiError` kinds |
| `src/state/workflows.tsx` | Independent survey and prescription state machines. State lives in memory plus sessionStorage; file binaries stay in memory only |
| `src/data/questions.ts` | Question model. Choice answers are stored as contract option **codes**, never as labels |
| `src/media/` | Client-side image budgets: product photo ≤ 1.25 MB, insight screenshots 3 × ≤ 900 KB |
| `src/styles/tokens.css` | Generated 1:1 from Figma Variables (`npm run tokens`). Do not edit by hand |
| `e2e/` | Playwright suite against the **deployed** site (below) |
| `scripts/` | Puppeteer harnesses for the local suites. Screenshots go to `scripts/shots/` (gitignored) |

- Routes mirror the state machine: `/survey/step/1..3 → upload → generating → result → delivery`, plus `/survey/error`, and the same pattern under `/prescription`.
- Every error kind has its own screen: `unavailable`, `rate-limited`, `timeout`, `error`, and input errors that return to the form.
- There is no silent mock fallback. If the API is unreachable, the user sees an error and never a fabricated report.

## Tests

| Command | What it runs | Count |
|---|---|---|
| `npm run typecheck` / `lint` / `tokens:check` | tsc, oxlint, Figma token drift | — |
| `npm run e2e` | UI flows on a mock build (:5199) | 48 |
| `npm run test:media` | image compression budgets | 6 |
| `npm run test:adapter` | contract → view-model adapters, error mapping (incl. edge 429) | 12 |
| `npm run e2e:integration` | real Chrome → production build → real HTTP → FastAPI with a deterministic fake Gemini gateway (:8000/:5197) | 25 |
| `npm run smoke:prod` | non-billed production checks (health, CORS, bundle) | 10 |
| `npm run e2e:prod` | **Playwright, production**: free checks | 14 |
| `SOSU_E2E_PAID=1 npm run e2e:prod` | + 1 live diagnosis and 1 live prescription (billed) | +3 |
| `SOSU_E2E_WAF=1 npm run e2e:prod` | + edge rate-limit check (empty submits only) | +1 |

**Production Playwright suite (`e2e/`).**
- A request guard counts every diagnosis or prescription POST that would leave the browser. Budgets are free 0, paid 2, WAF 6, and anything over budget is aborted before it is sent.
- Error states (503, 502 → retry, 504, plain-text edge 429) are fulfilled inside the browser, so they never reach Gemini or the WAF counter.
- The paid run feeds the live response to the backend's own Q18 checker (`e2e/tests/q18_check.py`).
- Optional pins: `E2E_EXPECT_FE_SHA`, `E2E_EXPECT_BE_BUILD`. Override the targets with `E2E_BASE_URL` and `E2E_API`.

Run the local suites one at a time. Do not run `e2e` and `e2e:integration` together.
