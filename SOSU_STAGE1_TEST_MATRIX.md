# SOSU — Stage 1 Test Matrix

- 실행일: 2026-10-18, 스프린트 13:30–14:00 KST. 표의 결과는 모두 실제로 실행한 결과임. 백엔드 커밋 `01497c7` 기준.
- 테스트 증거 파일(gitignored)
  - 프론트: `web/scripts/shots/` 아래의 `int_run{1,2,3}.log`, `g_*.log`, `integration/*.png`, `integration/results.json`
  - 백엔드: 아래 명령의 출력
- Class D(Live Gemini)는 **실행하지 않았음(NOT RUN)**. 스프린트 도중 오너가 실제 키를 `.env.local`에 넣었음. 이후 백엔드 pytest는 `GEMINI_API_KEY=PASTE_YOUR_GEMINI_API_KEY_HERE`로 env를 덮어써서 돌렸음(env가 dotenv보다 우선함). fake 서버는 gateway를 override하므로 Gemini를 호출하지 않음.

## Class A — 단위 / 계약 (서버·Gemini 불필요)

| ID | 시나리오 | 기대 | 실제 | 결과 | 명령 | 담당 |
|---|---|---|---|---|---|---|
| A-BE-1 | 백엔드 전체 pytest | 전부 green, 라이브 테스트 1건 skip | 316 passed, 1 skipped, 2 warnings (12.3s) | PASS | `cd SOSU_py && GEMINI_API_KEY=PASTE_YOUR_GEMINI_API_KEY_HERE RUN_LIVE_GEMINI_TESTS=0 .venv/bin/pytest -q -o addopts=""` | B / ORCH 재검증 |
| A-BE-2 | ruff check | 0 | All checks passed (`app tests scripts`) | PASS | `.venv/bin/ruff check app tests scripts` | B / ORCH |
| A-BE-3 | ruff format | 0 | 77 files already formatted | PASS | `.venv/bin/ruff format --check app tests scripts` | B / ORCH |
| A-BE-4 | mypy | 0 | no issues in 47 source files | PASS | `.venv/bin/mypy` | B / ORCH |
| A-BE-5 | OpenAPI == runtime | 일치 | matches runtime | PASS | `.venv/bin/python scripts/check_openapi.py` | B / ORCH |
| A-BE-6 | 루트 `contracts/` == runtime | 일치 | matches runtime | PASS | `.venv/bin/python scripts/release_shared_contract.py --check` | B / ORCH |
| A-BE-7 | 키 없음 → 네트워크 없이 즉시 실패 | `MODEL_PROVIDER_ERROR`, provider 호출 0회 | 빈 키와 placeholder 키 모두 통과 | PASS | `tests/test_gemini_client.py::test_unconfigured_key_fails_fast_without_calling_the_provider` | ORCH |
| A-BE-8 | 프로덕션 앱 격리 | `/__fake__` 없음, override 없음, 키 없으면 502 | `502 MODEL_PROVIDER_ERROR ok=False`, `/__fake__/scenario` 404, `dependency_overrides={}` | PASS | `create_app()`에 TestClient probe (Integration Report §5) | ORCH |
| A-KB-1 | KnowledgePack 스키마·출처·enum 검증 | VALID | rules=93, task_mapping contract check OK, VALID | PASS | `.venv/bin/python knowledge/tools/validate_pack.py` | C / ORCH |
| A-KB-2 | `knowledge/tools` lint | — | ruff 179건 (E501 139, E701 34, E702 6). 기존 게이트 대상(`app tests scripts`)은 아님 | 해당 없음 (기록만) | `.venv/bin/ruff check knowledge/tools` | C |
| A-FE-1 | typecheck | 0 error | rc=0 | PASS | `npm run typecheck` | A / ORCH |
| A-FE-2 | tokens:check | up to date | rc=0 | PASS | `npm run tokens:check` | A / ORCH |
| A-FE-3 | lint | 0 error | 0 error, 16 warning (기존 15건 + `workflows.tsx`의 only-export-components) | PASS (경고 있음) | `npm run lint` | A / ORCH |
| A-FE-4 | adapter·계약 테스트 (9건) | 9/9 | 9/9 | PASS | `npm run test:adapter` (:5196) | A / ORCH |
| A-FE-5 | 미디어 준비 (6건) | 6/6 | 6/6 | PASS | `npm run test:media` (:5198) | A / ORCH |

A-FE-4의 9건 구성:
- diagnosis와 prescription 응답의 의미 필드가 보존되는지
- envelope와 malformed 응답 처리
- 에러 fixture 12종의 kind, code, retryable 매핑
- 요청 mapper가 `diagnosis.request.json`을 그대로 재현하는지
- 선택지 코드·라벨·max가 `ui_option_catalog`와 같은지
- 구 코드 migration
- `X-Request-ID` 형식
- Instagram URL 규칙

## Class B — 백엔드 통합 (TestClient, 실제 오케스트레이션 + 결정론 gateway)

| ID | 시나리오 | 결과 | 근거 | 담당 |
|---|---|---|---|---|
| B-1 | fake 서버에서 반복 성공(≥3회) — diagnosis, prescription | PASS | `tests/test_fake_server.py` (17건, A-BE-1에 포함) | B |
| B-2 | 시나리오별 기대 code·HTTP·retryable — timeout, provider, schema, repairable, repair_failed, fatal_content, slow | PASS | 동일 | B |
| B-3 | 프로덕션 `create_app()`에 `/__fake__` 없음, 실제 gateway 사용 | PASS | 동일, A-BE-8 | B / ORCH |
| B-4 | 지식 블록이 두 서비스 합성 프롬프트에 들어가는지, 답변이 바뀌면 규칙도 바뀌는지, 팩이 없을 때 graceful한지 | PASS | `tests/test_knowledge.py` (16건) | B |
| B-5 | research 경계 — Null provider 기본, 출처를 조작하지 않음 | PASS | `tests/test_research.py` | B |
| B-6 | 수동 스모크: serve_fake :8010에서 diagnosis 3회 200, prescription 200, last-request 캡처, 127.0.0.1 바인딩 | PASS | 오케스트레이터 curl (Integration Report §5) | ORCH |

## Class C — 브라우저 통합 (실제 React → HTTP → FastAPI → 결정론 gateway)

- 명령: `cd web && npm run e2e:integration`
  - 이 명령이 fake API(:8000)를 띄우고, http 모드로 빌드한 뒤 :5197에서 preview를 띄움.
  - 끝나면 자기가 띄운 프로세스만 종료함.
- 최종 실행: run3 **20/20**, rc=0, 40s.
- run1은 20/20이었음.
- run2는 19/20이었음. 실패한 1건은 health 검사였음. 오너가 실제 키를 넣어 `gemini_configured=true`가 되자 테스트의 단정(`false`)이 깨진 것임. 이 검사를 "fake gateway 사용(`X-SOSU-Fake: 1`) 확인"으로 바꾼 뒤 run3에서 통과함.
- run2는 레거시 e2e(:5199)와 **동시에** 실행했음. 앱 관련 항목 19건은 모두 통과했고 포트 충돌은 없었음.

| ID | 시나리오 | 기대 | 결과 |
|---|---|---|---|
| INT-H | health — contract 1.0, fake gateway 표시 | `X-SOSU-Fake: 1` | PASS |
| INT-D1 | 진단(이미지 있음) → 결과 렌더링 | positioning.summary, strengths[].title, final_guidance[0] 텍스트가 화면에 표시됨 | PASS (주요 필드 5개 렌더링) |
| INT-D2 | 선택형 코드와 Q18 단일값 직렬화 | q6 `[design,color]`, q9 `[specialness,memories]`, q10 `[moved]`, q16 `[low_reach,low_follower_growth]`, q17 `[process]`, q18 `"face_only"`, cv 1.0, ko-KR | PASS |
| INT-D3 | 클라이언트 압축 후 multipart 전송 | ≤1.25 MB | PASS (15,734,255 B PNG → 1,179,308 B JPEG) |
| INT-D4 | 결과 반응형 (320, 1440) | 가로 오버플로 없음 | PASS |
| INT-D5 | http 모드 이메일 | 가짜 `/delivered` 없음 | PASS (`/survey/delivery`에 머무름, unavailable 상태) |
| INT-D6 | 진단(이미지 없음) | `product_image` part 0개, 성공 | PASS |
| INT-D7 | 비재시도 422 `INSUFFICIENT_INPUT` | 입력 화면으로 복귀 + role=alert, 재시도 루프 없음 | PASS (`/survey/upload`, 안내 문구 표시) |
| INT-D8 | 502 provider error → 다시 시도 → 성공 | error 화면 → result | PASS |
| INT-D9 | 504 timeout (즉시 주입) | timeout 문구 표시 | PASS |
| INT-D10 | repairable → 실제 validator와 1회 repair → 성공 | result | PASS |
| INT-D11 | `REPAIR_FAILED` | error 화면 | PASS |
| INT-D12 | stale 응답 — slow(4s) 처리 중 새로고침 | 늦게 온 응답이 결과로 반영되지 않음 | PASS (`/survey/upload`에 머무름) |
| INT-D13 | API 도달 불가 → mock으로 폴백하지 않음 | error 화면, 보고서 없음 | PASS (`/survey/error`) |
| INT-P1 | 처방(스크린샷 3장) → 결과 렌더링 | summary와 next_actions[4].title 표시, `insight_images` 3개 각 ≤900 KB, URL 전달 | PASS (49,940 / 124,714 / 159,371 B) |
| INT-P2 | 처방 결과 @320 | 가로 오버플로 없음 | PASS |
| INT-P3 | 2장이면 UI가 막고, API는 422 `INVALID_IMAGE_COUNT` | 막힘, 422 | PASS |
| INT-P4 | 비이미지 → 415 `INVALID_IMAGE_TYPE`, 2.1 MB JPEG → 413 `IMAGE_TOO_LARGE` | 415 / 413 | PASS |
| INT-P5 | 업로드 accept | webp 있음, pdf 없음 | PASS (`image/jpeg,image/png,image/webp`) |
| INT-P6 | `/p/` URL | 클라이언트에서 차단 | PASS |

## Class C′ — 레거시 프론트 회귀 (mock 모드)

| ID | 시나리오 | 결과 | 명령 |
|---|---|---|---|
| L-1 | 레거시 e2e 44건 + 신규 3건 (accept, 구 코드 migration, `/p/` 거부) | **47/47 PASS** (50s, 통합 E2E와 동시 실행) | `npm run e2e` (:5199, `VITE_API_MODE=mock`) |
| L-2 | Stage 0의 간헐 실패 (:5199 `ERR_CONNECTION_REFUSED`) | 재현되지 않음. 이번 스프린트에서 레거시 e2e를 3회(A 2회 + ORCH 1회) 돌렸고 모두 통과함. **원인은 여전히 미확인**이고, 재실행 통과만으로 수정되었다고 판단하지 않음. 포트 분리(5196/5197/5198/5199/8000)로 충돌 가능성은 제거함 | — |

## Class D — Live AI

| ID | 시나리오 | 결과 |
|---|---|---|
| D-1 | `tests/test_live_gemini.py` | **NOT RUN** (스프린트 금지 사항) |
| D-2 | 실제 진단·처방 품질, 가이드북 반영 효과 | **NOT RUN** → `SOSU_PHASE2_GEMINI_ACTIVATION.md` |
| D-3 | 외부 리서치 (Google Search grounding) | **NOT RUN / 미구현** — 경계만 존재 (`SOSU_py/docs/RESEARCH_BOUNDARY.md`) |
