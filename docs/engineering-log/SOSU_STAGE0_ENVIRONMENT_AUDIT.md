# SOSU — Stage 0 Environment Audit

- 작성: 2026-10-18 · Claude Code 2.1.302 (Opus 5.5) · READ-ONLY 정찰
- 루트: `/home/sieg/projects-wsl/sosu` (root HEAD `d1f03cf`, submodule `SOSU_py` HEAD `3d19714`)
- 이 파일이 이번 단계의 유일한 신규 산출물. 애플리케이션 코드·브랜치·의존성은 변경하지 않음.

---

## A. Executive Summary

- **환경 준비도: 높음.** WSL2 Ubuntu 24.04, 24 logical cores, 15 GiB RAM, 디스크 613 GB 여유. Node 20 / npm 10 / pnpm 10 / Python 3.12 / uv 0.10.8 / Docker 29 / system Chrome / Playwright·Puppeteer 브라우저 캐시가 모두 있음. `web/node_modules`와 `SOSU_py/.venv`도 이미 설치되어 있어 **설치 없이 모든 게이트를 실행할 수 있음.**
- **백엔드 (`SOSU_py`): 완성도 높음, 키 없이 green.**
  - pytest는 279개를 수집했고 278 pass, 1 skip(live Gemini)이었음.
  - ruff, ruff format, mypy, `check_openapi.py`, `release_shared_contract.py --check`가 모두 rc=0.
  - Gemini는 `GeminiGateway` Protocol과 FastAPI `Depends(get_gateway)`로 주입됨. **pytest 안에서는 `dependency_overrides`로 production 코드를 바꾸지 않고 fake를 주입할 수 있음.**
  - **실행 중인 서버에는 fake gateway를 고를 경로가 없음.** 플래그와 deterministic gateway 클래스 1개를 추가하는 것이 최소 변경임.
- **프론트 (`web/`): mock 런타임 상태로 동결.**
  - typecheck, tokens:check, lint(경고만), test:media 6/6은 통과.
  - e2e는 1차 실행 36/44(:5199 `ERR_CONNECTION_REFUSED`), 단독 재실행 44/44였음. **간헐 실패이며 원인은 미검증.**
  - 실제 API 연결은 전혀 안 되어 있음. `src/api/client.ts:18` `export const api: SosuApi = mock;`
- **계약 정합: 실제 왕복을 막는 갭이 확인됨.**
  1. 프론트 선택지 코드 13개가 계약 enum에 없음. 런타임에서 `ValidationError`로 거부되는 것을 확인했음(alias 해석 없음).
  2. Q18이 배열로 저장되는데, 계약은 단일 값임(거부 확인).
  3. 프론트 API 시그니처에 파일이 없음. 계약은 multipart(`payload` JSON 문자열 + 파일)임.
  4. 응답 ViewModel 형태가 계약과 크게 다름. adapter가 필요함.
  5. 이메일 엔드포인트가 계약에 없음.
- **Git 상태:** 원격과 로컬이 일치함(divergence 0).
  - 루트 superproject의 submodule gitlink는 `5927c1b`(빈 Initial commit)인데, 실제 checkout은 `3d19714`임. 그래서 `M SOSU_py`로 표시됨.
  - 루트 `contracts/`와 `SSOT/`는 untracked임.
  - **`STATUS.md`와 `HANDOFF.md`는 일부 stale임.** "web/ untracked", "SOSU_py 미커밋 11건"은 현재 사실이 아님.
- **병렬성:**
  - 네이티브 subagent 병렬 실행(이번 정찰에서 2개 동시 실행), 백그라운드 작업, 동시 테스트 실행이 모두 **검증됨**.
  - git worktree 격리는 도구상 AVAILABLE이지만, 이 레포에서는 **비실용적임**(submodule 미초기화, untracked 계약, gitignored 의존성).
  - 권장안은 **디렉터리 소유권 기반 격리**임.

---

## B. Environment Matrix

| Tool | Version / 값 | 상태 | Evidence | 제약 |
|---|---|---|---|---|
| OS / Kernel | Ubuntu 24.04.4 LTS on WSL2, 6.18.33.2-microsoft-standard | AVAILABLE | `uname -a`, `/etc/os-release` | WSL2 — localhost 포워딩은 Windows 측 브라우저에서 유효(미검증) |
| Shell | bash, tmux 3.4 | AVAILABLE | `$SHELL`, `tmux -V` | |
| CPU / RAM | 24 logical cores, 15 GiB total (13 GiB available), swap 4 GiB | AVAILABLE | `nproc`, `free -h` | |
| Disk | `/` 1007G, 613G free (36%) | AVAILABLE | `df -h` | |
| git | 2.43.0 `/usr/bin/git` | AVAILABLE | | |
| gh CLI | 2.45.0, `Siegfriex`로 로그인됨 | AVAILABLE | `gh auth status` | 이번 단계에서는 미사용 |
| Python | 3.12.3 (`/usr/bin/python3`), venv `SOSU_py/.venv` 3.12.3 | AVAILABLE | | |
| uv | 0.10.8, cache `~/.cache/uv` 38G | AVAILABLE | `uv --version` | `uv run`은 sync를 유발할 수 있으므로 이번 단계에서는 `.venv/bin/*`을 직접 호출 |
| pytest / ruff / mypy | `.venv/bin`에 설치됨 | AVAILABLE | 실행 rc=0 | |
| uvicorn / fastapi / httpx | `.venv/bin`에 설치됨 | AVAILABLE | `ls .venv/bin` | 서버 기동은 미실행 |
| Node / npm / pnpm | v20.20.1 / 10.8.2 / 10.34.5 | AVAILABLE | | 레포는 npm(`package-lock.json`) 사용 |
| npm cache | `~/.npm` 6.0G | AVAILABLE | | |
| `web/node_modules` | 설치됨 | AVAILABLE | typecheck/e2e 실행 성공 | |
| TypeScript / Vite / oxlint | ~6.0 / 8 / 1.81 | AVAILABLE | package.json | vitest 없음, 단위 테스트 러너 없음 |
| Browser automation | puppeteer-core ^24.43 + `/usr/bin/google-chrome` | AVAILABLE | e2e 44/44 (rerun) | headless `--no-sandbox` |
| Playwright | 브라우저 캐시만 있음(`~/.cache/ms-playwright` chromium-1208…1234). `web`에 패키지 없음 | PARTIAL | `npx --no-install playwright` → missing | 쓰려면 설치가 필요함(금지됨) → puppeteer harness 사용 |
| Docker | 29.1.3, daemon 응답 | AVAILABLE | `docker info` | 필요성 낮음 |
| podman | — | UNAVAILABLE | | |
| vercel CLI | — | UNAVAILABLE (CLI) | `vercel: command not found` | Vercel MCP는 연결됨 |
| Network → GitHub | `git ls-remote` 성공 (두 레포) | AVAILABLE | 아래 K | |
| localhost ports | 5173 / 5199 / 8000 모두 free (점검 시점) | AVAILABLE | `ss -ltn` | e2e·media 둘 다 :5199 strictPort |
| Claude Code | 2.1.302 | AVAILABLE | `claude --version` | settings `permissions.defaultMode=auto`, `worktree.baseRef=head`, SessionStart hook 1개, plugin `harness` |
| Native subagents (Agent tool) | Explore/general-purpose/Plan 등 | **AVAILABLE (검증)** | 이번 정찰에서 Explore 2개 동시 실행, 각 60~70초 | |
| Parallel tool calls | | **AVAILABLE (검증)** | 동일 턴 다중 Bash/Agent 호출 | |
| Background tasks | `run_in_background` | **AVAILABLE (검증)** | BE/FE 게이트를 동시에 백그라운드로 실행 | |
| Agent 간 메시징 | SendMessage / ListAgents | AVAILABLE (도구 존재) | subagent hand-back 수신 | 팀 조정 기능은 미검증 |
| Worktree isolation | Agent `isolation:"worktree"`, EnterWorktree | AVAILABLE (도구) / **비실용적** | §H 참고 | submodule·untracked·deps 문제 |
| Workflow (multi-agent script) | Workflow tool | AVAILABLE (opt-in 필요) | | 사용자가 명시적으로 opt-in해야 함 |
| MCP | Figma plugin, Vercel, Gmail, Google Drive, Claude Docs, Notion(auth 필요), IDE | AVAILABLE | 세션 도구 목록 | 통합 스프린트에는 필요 없음 |
| Secrets | `SOSU_py/.env.local`: `GEMINI_API_KEY`는 **placeholder**(`gemini_configured=False` 확인), `RUN_LIVE_GEMINI_TESTS=0`. `web/.env.local`: `VERCEL_OIDC_TOKEN` 존재. 셸 환경에는 관련 키 없음 | — | 값은 출력하지 않음 | 둘 다 gitignored |

---

## C. Git / Workspace State

| 항목 | 루트 `sosu` | `SOSU_py` (submodule) |
|---|---|---|
| 경로 / git dir | `/home/sieg/projects-wsl/sosu` / `.git` | `/home/sieg/projects-wsl/sosu/SOSU_py` / `.git/modules/SOSU_py` |
| Remote | `https://github.com/Siegfriex/sosu.git` | `https://github.com/Siegfriex/SOSU_py.git` |
| Branch | `main` → `origin/main` | `main` → `origin/main` (`.gitmodules` branch=main) |
| HEAD | `d1f03cf3ed130c59b4902a327cbab98aba8ee1b4` | `3d197144d803ecb47d15a5fb6f26c294d6a9a44b` "Freeze SOSU AI service v1 baseline" |
| Divergence | 0/0 (`ls-remote` main=`d1f03cf`) | 0/0 (`ls-remote` main=`3d19714`) |
| 기타 브랜치 | 로컬 `deploy` `b68bfc4`는 origin보다 **5 behind**. `origin/deploy == d1f03cf == main` | 없음 |
| Tags | 없음 | `ai-service-v1-checkpoint-20260913` (annotated `cdb3a51` → `3d19714`) |
| Working tree | `M SOSU_py` · `?? SSOT/` · `?? contracts/` | clean |
| Stash | 없음 | 없음 |
| Worktrees | 1 (main only) | 1 |
| Submodule | `SOSU_py`. **gitlink는 `5927c1b`(Initial commit)이고 checkout은 `3d19714`**(94 files, +15,890 lines 차이). 원격 `sosu` main의 submodule 포인터는 빈 커밋을 가리킴 | — |
| Ignored 런타임 | `web/node_modules`, `web/dist`, `web/.env.local`, `web/scripts/shots/` | `.venv`, `.env.local`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache` |

**관계:** 별도 레포 2개로, `SOSU_py`가 루트의 submodule임. 루트가 추적하는 것은 `web/`, `HANDOFF.md`, `STATUS.md`, `README.md`, `LICENSE`, `.gitmodules`임(`git ls-files web` = 47).

**동시 작업 시 충돌 회피:**
- `web/`는 루트 레포의 index에, `SOSU_py/`는 submodule 자체 index에 기록됨. 커밋 대상 index가 물리적으로 분리되어 있어 두 에이전트의 동시 커밋 충돌 가능성이 낮음.
- 단, **루트 index는 `web/`, `contracts/`, submodule bump가 공유함.** 루트 커밋은 orchestrator 한 명만 하도록 직렬화할 것.

**문서 stale 경고:**
- `STATUS.md` §1: "web/ 46개 파일 untracked", "SOSU_py 미커밋 11건" — 현재는 web이 커밋되어 있고 SOSU_py는 clean.
- `HANDOFF.md` §1/§2: "web/ 미커밋" — 현재 사실 아님.
- `STATUS.md` §4.1의 코드 불일치 표는 아래 F에서 재검증했고, 여전히 유효함.

---

## D. Frontend Architecture (`web/`)

**스택:** Vite 8, React 19, TypeScript ~6.0, react-router-dom 7(BrowserRouter), oxlint. 테스트는 puppeteer-core 자체 harness로 함. vitest/jest는 없음.

**설정:**
- `vite.config.ts`: `plugins:[react()]`뿐임. dev port 기본 5173, **proxy 없음**.
- `vercel.json`: SPA rewrite `/(.*) → /index.html`만 있음. API rewrite 없음.
- **`import.meta.env` 사용처 0곳.** `vite-env.d.ts` 타입 선언 없음.

**라우팅** (`src/App.tsx:16-31`, 라우트 정의는 `src/state/workflows.tsx`):
- `/survey`, `/survey/step/:n`, `/survey/upload|generating|result|delivery|delivered|error`
- `/prescription`, `/prescription/generating|result|delivery|delivered|error`

**화면:** `src/screens/survey.tsx`, `src/screens/prescription.tsx`. 컴포넌트는 `src/components/{shell,controls,blocks}.tsx`.

**상태** (`src/state/workflows.tsx`):
- useReducer와 sessionStorage `sosu.survey.v2` / `sosu.prescription.v2`(:41-42)를 씀.
- `fileStore`(:45-54)는 메모리 Map에 File을 보관함. 영속하는 것은 FileMeta뿐임.
- GENERATING 중 새로고침하면 UPLOAD/INPUT으로 돌아감(:64).

**질문 스키마** (`src/data/questions.ts`):
- 답변 키는 `q01…q18, q20`. 타입은 `Answers = Record<string, AnswerValue>`(:109).
- 선택형 답변은 code 배열로 저장함. Q18(single)도 배열임.
- Q9에는 `maxSelection`이 없음.

**업로드:**
- `FileUploader`(`blocks.tsx:33`) 기본 accept는 jpeg/png/**pdf**이고 max가 없음. 그래서 문진표는 PDF를 포함해 여러 장을 올릴 수 있음.
- 처방은 `accept="image/jpeg,image/png" max=3`(`prescription.tsx:42`). webp는 미지원.
- `src/media/{compressImage,prepareProductImage,prepareInsightImage}.ts`는 예산이 계약과 같음(1.25MB, 900KB×3, 합 2.7MB). 그러나 **어떤 화면에도 import되지 않음**(media-test만 사용).

**API 경계** (`src/api/`):
- `client.ts:12-16` 인터페이스:
  ```ts
  generateDiagnosis(answers: Answers, opts?: {signal?}): Promise<SurveyReport>
  generatePrescription(url: string, opts?): Promise<PrescriptionReport>
  sendReportEmail(email: string): Promise<void>
  ```
  → **파일 파라미터 없음.**
- **스위치:** `client.ts:18` `export const api: SosuApi = mock;` — mock/real을 가르는 유일한 지점.
- `mock.ts`:
  - `?fail=timeout|error`, `?fixture=long` 쿼리를 읽음(:17, :53-56, :80-82).
  - `fail@` 이메일은 `send-error`를 던짐(:92).
  - 지연은 2800ms / 2600ms / 900ms.
- `errors.ts`: `ApiErrorKind = 'timeout'|'error'|'send-error'`, `generationErrorKind(e)`.
- `validation.ts`: `isValidInstagramUrl`은 host(`instagram.com`)만 검사함.

**ViewModel** (`src/data/report.ts`):
- `SurveyReport`: 대부분 평면 string. `priorities`와 `reelTypes`는 string 3-tuple, `structure`는 `{range,guide}[]`, `guidebookNote`가 있음.
- `PrescriptionReport`: `{prescription:string, nextActions:string[], tone:string}`.

**렌더링:**
- `SurveyResult`(`survey.tsx:109-141`), `PrescriptionResult`(`prescription.tsx:262-280`). 둘 다 `ReportSection`과 `ReportBrandTable`(`blocks.tsx:151,160`)을 씀.
- `LoadingState`(`blocks.tsx:105`)는 700ms 간격 타이머 4단계로, 실제 progress가 아님.
- `ErrorState`(`blocks.tsx:135`)는 `kind: timeout|error` 두 종류만 받음. retry는 generating 라우트로 재진입함.
- generating 화면이 에러를 잡아 error 라우트로 보냄(`survey.tsx:83-90`, `prescription.tsx:236-243`).
- **non-retryable(입력 오류) 상태는 UI에 없음.**

**Mock → real 최소 변경면:**
1. `src/api/http.ts`(신규)에 `SosuApi`를 구현함.
   - multipart로 `payload`에 JSON 문자열을 넣음.
   - diagnosis는 `product_image` 0..1장, prescription은 `insight_images` 정확히 3장을 보냄.
   - 요청 시 `X-Request-ID`를 붙임.
2. `client.ts:18`을 env 기반으로 선택하게 바꿈(`VITE_API_MODE`, `VITE_API_BASE_URL`, `vite-env.d.ts`). **e2e가 mock knob에 의존하므로 mock은 선택지로 유지해야 함.**
3. 시그니처에 파일을 추가함. 화면 2곳(survey upload→generating, prescription input→generating)이 `fileStore.get(id)`에서 꺼낸 파일을 `prepare*`에 통과시켜 전달하도록 바꿈. **화면 파일을 최소한으로 수정해야 함.**
4. 요청 mapper: `q01`→`q1_brand_name` 등으로 바꾸고, `contract_version:"1.0"`과 `locale:"ko-KR"`를 붙임. Q18은 배열을 단일 값 또는 null로 바꿈.
5. 응답 adapter: envelope `data`를 `SurveyReport` / `PrescriptionReport`로 변환함.
6. 에러 mapper: `MODEL_TIMEOUT`은 `timeout`으로, 나머지는 `error`로 매핑함. 입력 검증류를 어떻게 처리할지는 결정이 필요함(J).
7. `questions.ts`의 코드 13개를 정렬하고, Q9에 max 3을 반영함. e2e 기대값도 갱신함.
8. 클라이언트 timeout을 180s보다 길게 잡음(현재 없음).

---

## E. Backend Architecture (`SOSU_py/`)

**의존성** (`pyproject.toml`):
- 런타임: fastapi, google-genai, httpx, pillow, pydantic 2, pydantic-settings, python-multipart, tenacity, uvicorn[standard].
- dev: pytest, pytest-asyncio(`asyncio_mode=auto`), ruff(py312, line 100, E/F/I/B/UP/W), mypy(`packages=["app"]`, pydantic plugin).

**엔트리:**
- `app/main.py:86` `create_app()`, `:159` `app = create_app()`.
- CORS(:100-106)는 `settings.cors_origins_list`를 씀. 기본값은 `http://localhost:5173`(`app/config.py:52`)이고 `SOSU_CORS_ORIGINS` env로 바꿀 수 있음. **코드 수정 없이 :5199 등을 추가할 수 있음.**
- Request-ID middleware(:108).
- 예외 핸들러(:118-152)는 SosuError, RequestValidationError(→422 INVALID_REQUEST), HTTPException, catch-all 500을 처리함.
- OpenAPI hook(:61-83)이 payload 모델과 `x-payload-models`를 주입함.

**라우터** (`app/api/v1.py`, prefix `/api/v1`):

| Method | Path | 위치 | 요청 / 응답 |
|---|---|---|---|
| GET | `/health` | :105 | envelope 없음. `{status, service, contract_version, gemini_configured}` |
| POST | `/diagnosis` | :110 | multipart: `payload`(JSON 문자열), `product_image` 0..1 |
| POST | `/prescription` | :157 | multipart: `payload`, `insight_images` ×3 |

**설정** (`app/config.py`):
- pydantic-settings로 `.env`, 그다음 `.env.local`을 읽음. `get_settings()`는 lru_cache됨(:68).
- `gemini_configured`(:55-57)는 빈 값과 placeholder를 false로 판정함. 이 머신에서는 **False 확인**.
- env 이름:
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL_{OBSERVE,DIAGNOSIS,PRESCRIPTION}`
  - `GEMINI_THINKING_{OBSERVE,SYNTHESIS,REPAIR}`
  - `GEMINI_MAX_OUTPUT_{OBSERVE,DIAGNOSIS,PRESCRIPTION,REPAIR}`
  - `GEMINI_TIMEOUT_{OBSERVE,SYNTHESIS,REPAIR}` (45/90/40s)
  - `SOSU_REQUEST_DEADLINE_SECONDS` (180)
  - `SOSU_ENV`, `SOSU_LOG_LEVEL`, `SOSU_CORS_ORIGINS`, `SOSU_API_HOST`, `SOSU_API_PORT`
  - `RUN_LIVE_GEMINI_TESTS`

**Gateway 주입:**
- Protocol은 `app/gemini/gateway.py:51` `GeminiGateway`. 메서드는 `async generate_structured(*, spec, system_instruction, user_text, images, schema) -> StructuredResult[T]` 하나뿐임.
- 실제 구현은 `app/gemini/client.py:72` `GoogleGenAIGateway`(tenacity로 1회 재시도).
- `app/api/deps.py`:
  - `_build_gateway()`(:20-26)는 lru_cache되며 lazy import함. placeholder 키는 호출 시점에 `MODEL_PROVIDER_ERROR`가 됨(주석으로 명시됨).
  - `get_gateway()`(:29)
  - `get_diagnosis_service(gateway=Depends(get_gateway))`(:33)
  - `get_prescription_service`(:39)
- 기존 fake:
  - `tests/fakes.py:39` `FakeGateway`는 스크립트된 응답(BaseModel / SosuError / callable)을 순서대로 재생하고 호출을 기록함.
  - sample builder: `sample_visual`, `sample_insight`, `sample_diagnosis_draft`, `sample_prescription_draft`, `fake_image`.
  - `tests/test_api.py:102-103`은 서비스 레벨 fake를 쓰고 이미지 정규화를 monkeypatch함.
- **판정:**
  - **pytest 안**에서는 `app.dependency_overrides[get_gateway] = lambda: FakeGateway([...])`로 production 수정이 0임. 실제 서비스, validator, repair가 그대로 실행됨.
  - **실행 중 서버**(브라우저 E2E용)에는 fake를 고를 경로가 없음. 그래서 placeholder 키로 기동하면 모든 생성 요청이 `MODEL_PROVIDER_ERROR`를 냄.
  - **최소 안전 변경**은 두 가지임. 결정은 J1에 둠.
    - 안 1: settings 플래그(예: `SOSU_GATEWAY=fake`)를 추가하고 `deps._build_gateway()`에서 분기함. deterministic gateway 클래스는 `app/gemini/fake.py` 등에 둠. 추론 로직은 수정하지 않음.
    - 안 2: 별도 dev 엔트리 스크립트(예: `scripts/serve_fake.py`)를 둠. `create_app()`을 만든 뒤 `dependency_overrides`를 설정하고 uvicorn으로 띄움. 이 경우 `app/` 수정은 0임.
    - **주의(두 안 공통):** `tests/fakes.FakeGateway`는 스크립트된 응답 목록을 순서대로 소비하는 구조라, 반복 요청을 받는 서버에서는 첫 왕복 후 고갈됨. 서버용 double은 `schema` 타입(VisualObservationV1 / DiagnosisDraftV1 / InsightObservationV1 / PrescriptionDraftV1)으로 응답을 고르고, 에러 시뮬레이션 trigger를 따로 둬야 함. 기존 `sample_*` builder는 재사용할 수 있음. **Stage 1 critical path에 들어가는 신규 작업임.**

**파이프라인:**
- `app/domain/normalizer.py:70` `normalize_survey`가 `DeclaredEvidenceV1`을 만듦(NFC, trim, CRLF→LF, 빈값→null, 2000자 안전 길이).
- `app/domain/sufficiency.py:10`: 답변도 이미지도 없으면 `INSUFFICIENT_INPUT`.
- `app/domain/evidence_pack.py:24` `build_evidence_pack(declared, visual, locale)`. 정책은 `app/domain/policy.py`.
- 이미지(`app/images/types.py`, `normalize.py`):
  - 허용 타입은 jpeg/png/webp.
  - product: ≤1,250,000 B, long edge 1600, q85, 목표 700 KB.
  - insight: 정확히 3장, 각 ≤900,000 B, 합 ≤2,700,000 B, long edge 2000, q90.
  - EXIF transpose와 metadata strip을 함.
- Diagnosis(`app/services/diagnosis_service.py:37-82`): `with_deadline` → 선택적 `_observe`(VisualObservationV1) → evidence pack → `_synthesize`(DiagnosisDraftV1) → `run_with_repair` → `to_public_diagnosis`.
- Prescription(`app/services/prescription_service.py:52-80`): insight 3장 observe → synthesize(PrescriptionDraftV1) → repair → `to_public_prescription`.
- Validator(`app/domain/validator.py:178,237`): PASS / REPAIRABLE / FATAL. FATAL은 텍스트 필드의 80% 이상이 placeholder일 때.
- Repair(`app/services/repair.py:18`): 1회 시도. 실패하면 `REPAIR_FAILED`, FATAL이면 `MODEL_CONTENT_ERROR`.
- 프롬프트는 `app/gemini/prompts/`, Gemini 스키마는 `app/gemini/schemas.py`.

**에러 envelope** (`app/contracts/envelope.py:10`, `app/domain/errors.py:9`): `{ok:false, request_id, contract_version:"1.0", error:{code, message, retryable, details[]}}`

| code | HTTP | retryable |
|---|---|---|
| INVALID_REQUEST | 422 | false |
| INSUFFICIENT_INPUT | 422 | false |
| INVALID_IMAGE_TYPE | 415 | false |
| IMAGE_TOO_LARGE | 413 | false |
| INVALID_IMAGE_COUNT | 422 | false |
| INVALID_INSTAGRAM_URL | 422 | false |
| MODEL_TIMEOUT | 504 | true |
| MODEL_PROVIDER_ERROR | 502 | true |
| MODEL_SCHEMA_ERROR | 502 | true |
| MODEL_CONTENT_ERROR | 502 | true |
| REPAIR_FAILED | 502 | true |
| INTERNAL_ERROR | 500 | false |

**스트리밍과 이메일:** SSE, WebSocket, job polling 모두 없음. 동기 1회 요청이며 deadline은 180s. **이메일/PDF/SMTP 코드도 없음.**

---

## F. Contract / SSOT Inventory

| 문서 | 경로 | 상태 |
|---|---|---|
| AI Service SSOT (원문) | `SSOT/SOSU_AI_SERVICE_SSOT_FINAL_20260913.{md,pdf}` (루트, untracked) = `SOSU_py/SSOT/` (tracked) | md sha256 동일(`7e7bf8c6…`) |
| Domain Contract V1.0 | `contracts/01_DOMAIN_CONTRACT.md` (루트, untracked) | `release_shared_contract.py`가 생성함. "frozen, 수동 편집 금지" |
| OpenAPI | `contracts/02_openapi.json` (루트) == `SOSU_py/contracts/openapi.json` | sha256 동일(`0f56ee65…`), `check_openapi.py`로 runtime과 일치 확인 |
| 통합 fixtures | `contracts/03_CONTRACT_FIXTURES.json` (루트) | `{diagnosis,prescription}.{endpoint,request,success,errors.{retryable,non_retryable}}` + `ui_option_catalog` |
| 개별 fixtures | `SOSU_py/contracts/fixtures/*.json` 17개 | request/success/catalog 내용은 루트 번들과 **동일함**. error fixture는 내용이 같고 `request_id` 접두사만 다름(`fixture-model-timeout` vs `fixture-diagnosis-model-timeout`) |
| Frontend contract README | `SOSU_py/contracts/README.md` | v1.0 |
| Backend docs | `SOSU_py/docs/README.md` ("CONTRACT V1이 SSOT에 우선"), `SOSU_py/docs/AUDIT_2026-09-13.md` | |
| 프론트 핸드오프 | `HANDOFF.md`, `STATUS.md`, `web/README.md` | **일부 stale** (C 참고) |
| Drift 검증 | `SOSU_py/scripts/check_openapi.py` → "matches runtime"; `release_shared_contract.py --check` → "`/home/sieg/projects-wsl/sosu/contracts`: matches runtime" | 둘 다 rc=0 |

**항목별 authority:**

| # | 항목 | 현재 authority | 비고 |
|---|---|---|---|
| 1 | User input schema | `SOSU_py/app/contracts/diagnosis.py:26-69` (`SurveyAnswersV1`, `extra=forbid`) → 루트 `contracts/01` §2에 export | 프론트 `questions.ts`는 제안값임 |
| 2 | Stable code dictionary | `SOSU_py/app/contracts/enums.py`, `catalog.py` → `ui_option_catalog` | `ssot_code_aliases`는 **문서용**이며 런타임에서 해석되지 않음(아래) |
| 3 | Multipart upload | `app/api/v1.py:110,157`, `app/images/types.py`, `contracts/01` §1 | |
| 4 | Diagnosis response | `app/contracts/diagnosis.py` `DiagnosisReportV1` | |
| 5 | Prescription response | `app/contracts/prescription.py` `PrescriptionReportV1` (`next_actions` 정확히 4개) | |
| 6 | Error envelope | `app/contracts/envelope.py` | |
| 7 | Frontend rendering model | `web/src/data/report.ts` + Figma `06_Handoff E` | 계약과 형태가 다름 → adapter |

**경로 authority 충돌:**
- `HANDOFF.md` §6은 "루트 `contracts/`가 authority"라고 함.
- `SOSU_py/contracts/README.md`는 "this directory is the only interface"라고 함.
- 두 위치의 내용은 현재 동일하고, 둘 다 같은 런타임에서 생성됨. **차이는 untracked(루트) vs tracked(submodule)라는 점뿐임.**

**확인된 불일치** (해결하지 않음):

1. **선택지 코드:** 프론트 코드는 41개, 계약 코드는 39개. **프론트 전용 13개는 런타임에서 모두 거부됨.**
   - 검증: `SurveyAnswersV1.model_validate({'q9_purchase_motives':['special']})` → `ValidationError`. `['specialness']`는 통과함.
   - 프론트 전용 코드: `scarcity, special, memory, decor, unique_ownership, touching, low_views, low_followers, content_ideas, filming, editing, consistency, making_process`
   - 대응하는 계약 코드: `rarity, specialness, memories, space_decor, self_expression, moved, low_reach, low_follower_growth, ideation, shooting_difficulty, editing_difficulty, consistency_difficulty, process`
   - `ssot_code_aliases`의 key는 SSOT 문서 코드임(예: `slow_follower_growth`). 프론트 코드와 일부 겹치는 것은 우연이며, 이 표는 `catalog.py:145`에서 export에만 쓰임.
2. **Q18:** 프론트는 `string[]`, 계약은 단일 값 또는 null. 리스트 입력은 거부됨(검증함).
3. **Q9 max:** 프론트는 없음, 계약은 3. 계약상 Q6/9/10/11/16/17이 모두 multiple ≤3.
4. **답변 키:** `q01…` vs `q1_brand_name…`. 매핑 소스는 catalog의 `field` 값임.
5. **문진표 업로드:** 프론트는 여러 장에 PDF까지 허용함. 계약은 0..1장, jpeg/png/webp.
6. **처방 업로드:** 프론트는 webp를 받지 않음. 계약은 webp를 허용하므로 기능 손실일 뿐 오류는 아님.
7. **Instagram URL:** 프론트는 host만 검사함. 계약은 `/reel/<code>` 또는 `/reels/<code>`만 허용하고 `/p/`는 거부함.
8. **응답 형태:**
   - diagnosis:
     - `brand.keywords`가 `string[]`이고, `positioning`은 `{summary,rationale}`임.
     - `strengths`, `priorities`, `reel_types`는 객체 배열임.
     - `structure`는 `hook_0_3`, `body_3_10` 같은 key를 가진 객체임.
     - `final_guidance`는 `string[]`이고, `fonts.reason`이 추가되어 있음.
     - `guidebookNote`에 해당하는 필드가 없음.
   - prescription: `prescription`은 `{summary,diagnosis}`, `next_actions`는 `{order,title,description}[4]`, `tone`은 `{keywords,description}`.
9. **에러 분류:** 프론트는 3종, 계약은 12종 + `retryable` 플래그. non-retryable을 보여줄 UI가 없음.
10. **Timeout:** 서버 deadline은 180s이고 프론트에는 클라이언트 timeout이 없음. 로딩 4단계는 프론트 타이머로 연출함.
11. **Email:** `sendReportEmail`에 대응하는 엔드포인트가 없음.
12. **CORS:** 기본 origin은 `localhost:5173`뿐임. e2e harness는 :5199를 씀.

---

## G. Test Capability

모든 명령은 키 없이, `RUN_LIVE_GEMINI_TESTS=0` 상태에서 실행했음. 실행 후 `git status`는 변화 없음.

| # | 명령 (cwd) | rc | 시간 | 결과 |
|---|---|---|---|---|
| 1 | `.venv/bin/pytest -q` (SOSU_py) | 0 | 12.7s | **279 collected, 278 pass, 1 skip** (`test_live_gemini.py`, skipif). warning 2건(anyio typing). `addopts=-q`에 `-q`가 겹쳐 summary line이 출력되지 않음. 수는 `--collect-only -o addopts=""`와 진행 표시에서 산출 |
| 2 | `.venv/bin/ruff check app tests scripts` | 0 | <1s | All checks passed |
| 3 | `.venv/bin/ruff format --check app tests scripts` | 0 | <1s | 66 files already formatted |
| 4 | `.venv/bin/mypy` | 0 | 0.6s | no issues in 41 source files |
| 5 | `.venv/bin/python scripts/check_openapi.py` | 0 | 0.4s | matches runtime |
| 6 | `.venv/bin/python scripts/release_shared_contract.py --check` | 0 | <1s | 루트 `contracts/` matches runtime |
| 7 | `npm run -s typecheck` (web) | 0 | 1.6s | 0 error |
| 8 | `npm run -s tokens:check` | 0 | 0.1s | up to date (20/33/35) |
| 9 | `npm run -s lint` (oxlint) | 0 | 0.2s | 경고만 있음(`blocks.tsx:165-166` static-components, `survey.tsx:82` refs 등) |
| 10 | `npm run -s e2e` (1차, BE 게이트와 동시 실행) | **1** | 41.1s | **36/44.** 8건 모두 `net::ERR_CONNECTION_REFUSED at http://localhost:5199/…`. preview 서버가 실행 도중 사라짐. **원인 미검증** |
| 11 | `npm run -s e2e` (재실행, 단독) | 0 | 49s | **44/44** |
| 12 | `npm run -s test:media` | 0 | 9.3s | 6/6 |
| 13 | `SurveyAnswersV1.model_validate(...)` probe | — | — | `special` 거부, `specialness` 통과, `scarcity` 거부, `q18` 리스트 거부 |

**미실행 항목과 사유:**
- `npm run build`: e2e가 내부에서 build를 수행하고 통과했으므로 생략.
- live Gemini 테스트: 금지 사항.
- uvicorn 서버 기동과 실제 HTTP 왕복: 장시간 프로세스이고 placeholder 키로는 생성 요청이 `MODEL_PROVIDER_ERROR`가 되므로 Stage 1로 넘김.
- `uv run`/`uv sync`: lock/venv를 동기화할 가능성이 있어 `.venv/bin`을 직접 호출함.

**브라우저 자동화:**
- puppeteer-core와 system Chrome 조합은 **동작함**.
- Playwright는 패키지가 없음. 브라우저 바이너리 캐시만 있음.

**동시성 관련 사실:**
- `e2e`와 `test:media`는 둘 다 `PORT` 기본 5199를 strictPort로 씀. 포트가 사용 중이면 즉시 실패함.
- e2e 종료 직후에도 :5199가 잠시 LISTEN 상태였고, 이후 해제됨.
- 브라우저 테스트를 병렬로 돌리려면 `PORT=`를 프로세스마다 다르게 지정해야 함. harness는 `PORT`/`BASE_URL`/`CHROME` env를 지원함(`web/scripts/lib/harness.mjs:7-8,22`).

---

## H. Parallel Agent Feasibility

**검증된 능력:**
- 네이티브 subagent 동시 실행: 이번 정찰에서 Explore 2개를 병렬로 돌려 완료함.
- 백그라운드 셸: BE 게이트와 FE 게이트를 동시에 실행함.
- 다중 도구 병렬 호출.
- SendMessage로 subagent를 이어서 쓰는 기능.

**가능하지만 미검증:** Agent Teams 수준의 장기 조정, Workflow tool(사용자 opt-in 필요).

**Worktree 격리가 이 레포에서 비실용적인 이유:**
1. 루트 worktree는 submodule을 초기화하지 않음. 초기화하더라도 gitlink `5927c1b`(빈 커밋)가 checkout됨.
2. `contracts/`와 `SSOT/`가 untracked라 worktree에 없음.
3. `node_modules`와 `.venv`가 gitignored라 worktree마다 재설치(`npm ci`, `uv sync`)가 필요함. 캐시는 있지만 Stage 0에서는 설치가 금지되었고, 시간 비용도 있음.
4. `.env.local`이 복사되지 않음.

→ **worktree를 쓰려면** 다음 bootstrap이 필요함: `git -C SOSU_py worktree add` 별도 생성(submodule 레포 자체의 worktree), `npm ci`, `uv sync --frozen`, 계약 디렉터리 symlink. **권장하지 않음.**

**권장 격리: 디렉터리 소유권 + 레포 경계**

| 소유자 | 쓰기 권한 | 읽기 |
|---|---|---|
| Agent A (Frontend) | `web/src/**`, `web/scripts/**`, `web/vite.config.ts`, `web/.env.example`(신규) | `contracts/**`, `SOSU_py/contracts/**` |
| Agent B (Backend) | `SOSU_py/**` (submodule 레포; 자체 커밋) + 루트 `contracts/`는 **`release_shared_contract.py`로만 생성** | — |
| Orchestrator | 루트 커밋(submodule bump 포함), `HANDOFF.md`/`STATUS.md`, 통합 테스트 스크립트 | 전체 |

- 공유 fixtures는 B가 단일 writer임. A는 read-only로 import만 함. 동시 쓰기 없음.
- **포트 할당:**

  | 용도 | 포트 |
  |---|---|
  | BE fake 서버 | :8000 |
  | A의 e2e | :5199 |
  | A의 media | :5198 (`PORT=`) |
  | 통합 e2e | :5197 (CORS env에 추가) |

  사용자가 쓰는 :5173은 건드리지 않음.
- 리소스: 24코어와 13 GiB 가용 메모리면 headless Chrome 2~3개, uvicorn, pytest를 동시에 돌리기에 충분함.

**대안 (네이티브 병렬이 불안정할 때):** 편집은 orchestrator 한 명이 순차로 하고, 테스트만 백그라운드 병렬로 돌림. BE pytest와 FE e2e는 이미 동시 실행으로 검증됨.

---

## I. 60-Minute Sprint Feasibility

**선행 결정이 필요한 작업** (T+0~5분, orchestrator): J1 fake gateway 방식, J2 계약 경로, J3 에러 UX, J4 ViewModel 매핑, J5 이메일.

**독립적으로 병렬 가능한 작업:**

| 시간 | Agent B (Backend) | Agent A (Frontend) |
|---|---|---|
| T+5~25 | deterministic gateway + server-level 선택(J1). fixture 기반 고정 응답과 에러 시뮬레이션(요청 header 또는 payload trigger로 12 code 재현). FastAPI 통합 테스트(실제 서비스/validator/repair 경유). CORS env 문서화 | `questions.ts` 코드 13개 정렬 + Q9 max 3 + Q18 단일화. `http.ts` multipart client. 요청 mapper. 응답 adapter(fixture `diagnosis.success.json`/`prescription.success.json`으로 단위 검증). 에러 mapper. env 스위치(mock 유지) |
| T+25~40 | 게이트(pytest/ruff/mypy/check_openapi/release --check). 계약이 바뀌면 release 재생성(단일 writer) | 화면 2곳에 파일 전달 + `prepare*` 연결. 업로드 accept/max 계약 정렬. typecheck + 기존 e2e(mock 모드) 회귀 |

**직렬화가 필요한 작업:**
- 통합 E2E(T+40~55): fake 서버 :8000에 `VITE_API_MODE=http`로 브라우저를 주행함. 성공 2경로와 에러(timeout/retryable/non-retryable)를 확인함.
- 루트 커밋과 submodule bump(T+55~60): orchestrator 단일 담당.

**Critical path:** 결정(J1·J4) → B의 fake 서버 기동 가능 상태 + A의 http client·adapter → 통합 e2e. adapter는 fixture로 미리 검증할 수 있어서 B를 기다리지 않음.

**병목과 위험:**
1. **응답 adapter 매핑**이 가장 큼. 구조화 응답을 평면 문자열 ViewModel로 바꿀 때 섹션 의미를 판단해야 함(L5/L6 OPEN 연관).
2. **e2e 간헐 실패** 때문에 거짓 red가 나올 수 있음. 재시도 정책이나 포트 분리가 필요함.
3. **e2e가 mock knob(`?fail=`, `?fixture=long`)과 mock 지연에 의존함.** mock 모드를 유지하지 않으면 기존 44 check가 깨짐.
4. 화면 파일(`survey.tsx`, `prescription.tsx`)을 고쳐야 함. "화면 무수정" 원칙과 충돌함.
5. 루트 index 경합(web 커밋, contracts 추가, submodule bump).

**가장 빠른 경로:**
- 백엔드는 `dependency_overrides`를 쓰는 dev 엔트리 스크립트(J1 안 2)로 `app/` 수정 0을 지킴.
- 프론트는 `client.ts`의 env 스위치, adapter 3종, 화면 2곳의 최소 수정만 함.
- 통합은 fake 서버 하나에 대해 브라우저 주행 1세트를 돌림.

---

## J. Decision Requests (planner가 결정해야 할 것)

1. **J1 Fake gateway 노출 방식:** (a) `app/`에 settings 플래그와 deterministic gateway를 둠(배포 시 오용 방지 장치가 필요함). (b) `scripts/`에 dev 전용 엔트리를 두고 `dependency_overrides`로 주입함(`app/` 무수정). (c) pytest 전용으로 두고 브라우저 E2E는 프론트 mock만으로 함.
2. **J2 계약 authority 경로:** 루트 `contracts/`(untracked, HANDOFF가 지정)와 `SOSU_py/contracts/`(tracked) 중 하나를 고르고, 루트 `contracts/`와 `SSOT/`를 커밋할지 정해야 함. 아울러 **루트 submodule gitlink를 `5927c1b`에서 `3d19714`로 bump할지**도 정해야 함.
3. **J3 non-retryable 에러 UX:** 입력 검증류(`INVALID_*`, `IMAGE_TOO_LARGE`, `INSUFFICIENT_INPUT`)를 입력 화면 인라인 오류로 되돌릴지, 기존 ERROR 화면(retry 숨김)으로 보낼지 정해야 함. `retryable` 플래그 사용 여부도 포함함.
4. **J4 ViewModel 전략:** (a) adapter로 구조화 응답을 기존 평면 VM에 맞춤(화면 무수정). (b) VM을 계약 형태에 가깝게 확장하고 렌더러를 수정함. `positioning.rationale`(L6), `guidebookNote` 부재, `fonts.reason` 처리도 정해야 함.
5. **J5 이메일:** `sendReportEmail`을 mock으로 유지할지, 백엔드 엔드포인트를 신설할지(Stage 1 범위 밖 권장) 정해야 함.
6. **J6 문진표 업로드 정책:** 0..1장 jpeg/png/webp로 축소함(PDF 제거). 처방에 webp를 허용할지도 정해야 함.
7. **J7 Instagram URL 규칙:** 프론트 검증을 `/reel(s)/<code>`로 강화할지 정해야 함.
8. **J8 클라이언트 timeout:** 180s보다 큰 값(예: 190s)으로 정함.
9. **J9 런타임 모드 스위치:** env 이름(`VITE_API_MODE=mock|http`, `VITE_API_BASE_URL`)을 정함. Vercel 배포를 계속 mock으로 둘지, 프록시를 쓸지 아니면 CORS로 직접 호출할지 정해야 함.
10. **J10 e2e 포트 / CORS:** 통합 e2e 포트를 무엇으로 할지, `SOSU_CORS_ORIGINS`에 추가할지 정해야 함.
11. **J11 로컬 `deploy` 브랜치:** 5 behind 상태로 둘지 정해야 함(정보용). 원격 `deploy`는 main과 같음.

---

## K. Evidence Appendix

**SHA:**
- 루트 `main` / `origin/main` / `origin/deploy`: `d1f03cf3ed130c59b4902a327cbab98aba8ee1b4`
- 로컬 `deploy`: `b68bfc4` (Freeze frontend MVP baseline for Vercel)
- 루트 gitlink → `SOSU_py`: `5927c1b2e997e48f2d091bbb8e64b61c3737e358` (Initial commit)
- `SOSU_py` HEAD / `origin/main`: `3d197144d803ecb47d15a5fb6f26c294d6a9a44b`; tag `ai-service-v1-checkpoint-20260913` (`cdb3a51` → `3d19714`)

**git status (루트):**
```
## main...origin/main
 M SOSU_py
?? SSOT/
?? contracts/
```

**`git ls-remote` (2026-10-18):**
```
sosu:     d1f03cf… HEAD, refs/heads/deploy, refs/heads/main
SOSU_py:  3d19714… HEAD, refs/heads/main ; cdb3a51… refs/tags/ai-service-v1-checkpoint-20260913
```

**계약 해시:**
```
0f56ee6552dc…  contracts/02_openapi.json == SOSU_py/contracts/openapi.json
7e7bf8c6acbd…  SSOT/…md == SOSU_py/SSOT/…md
78b5c118cea8…  contracts/01_DOMAIN_CONTRACT.md (15,158 B)
42bac7274f8b…  contracts/03_CONTRACT_FIXTURES.json (27,365 B)
```

**Alias / 검증 probe:**
```
['special'] REJECTED ValidationError
['specialness'] ACCEPTED
['scarcity'] REJECTED ValidationError
q18 list REJECTED
gemini_configured(local .env.local)= False
```

**e2e 1차 실패 샘플:**
```
FAIL prescription long fixture @430: no horizontal overflow / clipping
     net::ERR_CONNECTION_REFUSED at http://localhost:5199/prescription/result
e2e: 36/44 passed
```
재실행: `e2e: 44/44 passed` (rc=0, 49s)

**핵심 파일 경로:**
- FE 스위치: `web/src/api/client.ts:12-18`
- FE 기타: `web/src/api/{mock,errors,validation}.ts`, `web/src/data/{questions,report}.ts`, `web/src/state/workflows.tsx`, `web/src/screens/{survey,prescription}.tsx`, `web/src/components/blocks.tsx`, `web/src/media/*.ts`, `web/scripts/{e2e,media-test}.mjs`, `web/scripts/lib/harness.mjs`
- BE: `SOSU_py/app/main.py`, `app/api/v1.py`, `app/api/deps.py:20-40`, `app/gemini/gateway.py:51`, `app/gemini/client.py:72`, `app/config.py:52-68`, `app/contracts/{diagnosis,prescription,envelope,enums,catalog}.py`, `app/domain/{normalizer,sufficiency,evidence_pack,validator,errors,policy}.py`, `app/services/{diagnosis_service,prescription_service,repair,deadline}.py`, `app/images/{types,normalize}.py`, `tests/fakes.py:39`, `tests/test_api.py:102-103`
- 계약 생성기: `SOSU_py/scripts/{export_openapi,check_openapi,make_fixtures,release_shared_contract}.py`
- 테스트 로그(세션 scratchpad, 임시): `/tmp/claude-1000/-home-sieg-projects-wsl-sosu/e954e70d-adbe-4314-9c43-41abd4b577ca/scratchpad/{be_*,fe_*}.log`
