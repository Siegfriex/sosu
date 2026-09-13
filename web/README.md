# SOSU web (canonical UI preview)

Vite + React + TypeScript. Design source of truth: Figma `ejRfXQERdNsBWbKYEdemRB` pages `00_Foundations` … `06_Handoff`.

```bash
npm install
npm run dev          # http://localhost:5173
npm run verify       # typecheck + tokens:check + e2e (44) + test:media (6) — the frozen baseline gate
```
`e2e` / `test:media` start their own server on :5199 (`BASE_URL=…` to reuse one). Screenshots → `scripts/shots/` (gitignored).

- `src/styles/tokens.css` — generated 1:1 from Figma Variables by `scripts/gen_tokens.py` (`npm run tokens`, `npm run tokens:check`). Do not edit by hand.
- `src/styles/global.css` — the 10 Text Styles (`.t-*`) + component styles. Font: SUITE Variable self-hosted (`public/fonts/`) → Noto Sans KR (Google Fonts) fallback.
- `src/data/questions.ts` — question model (06_Handoff §M). Choice answers are stored as option **codes**, text answers verbatim.
- `src/state/workflows.tsx` — independent survey / prescription slices, memory + sessionStorage, reset semantics.
- `src/api/client.ts` — the only API entry point screens use (`api = mock` until `/contracts` lands). `errors.ts` (`ApiError` kinds), `validation.ts`, `mock.ts` (`?fail=error|timeout`, `?fixture=long` on a generating route).
- `src/media/` — client-side image budget utilities (`prepareProductImage` ≤ 1.25 MB, `prepareInsightImages` 3 × ≤ 900 KB). Not wired into the UI yet.
- Routes mirror the state machine: `/survey/step/1..3 → /survey/upload → /survey/generating → /survey/result → /survey/delivery → /survey/delivered`, `/survey/error`; `/prescription → …`.

Loading stages are a presentation-only timer sequence, not a backend protocol.

Next phase (not in this preview): real API client behind `client.ts` once `/contracts` exists; PDF / email live in `SOSU_py`.
