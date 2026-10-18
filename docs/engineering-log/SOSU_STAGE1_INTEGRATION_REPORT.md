# SOSU — Stage 1 Integration Report

- **스프린트:** 2026-10-18 13:30:50 KST 시작. 최종 검증과 커밋은 약 14:00에 마침. 근거 시각은 셸 `date` 기록임.
- **방식:** 오케스트레이터 1명과 병렬 에이전트 3개로 진행함. A는 프론트, B는 백엔드, C는 가이드북 지식을 맡았음.
  - 디렉터리 소유권으로 격리했고 worktree는 쓰지 않았음.
  - 공유 계약 파일은 한 곳에서만 씀.
- **판정: Phase 1 COMPLETE.** 단, 아래 범위에 한정됨.
  - 외부 리서치(라이브 검색)와 실제 모델 품질은 정의상 Phase 2임.
  - 이메일 발송은 별도 기능으로 남겨 둠.
- 상세 결과: `SOSU_STAGE1_TEST_MATRIX.md`, `SOSU_GUIDEBOOK_KNOWLEDGE_REPORT.md`, `SOSU_PHASE2_GEMINI_ACTIVATION.md`

---

## 1. 구현 결과 요약

| 영역 | 결과 |
|---|---|
| 런타임 모드 | 기본값은 `VITE_API_MODE=http`(미설정 포함)이고, `mock`은 명시했을 때만 씀. HTTP가 실패해도 mock으로 넘어가지 않음. 확인 근거: INT-D13, 그리고 http 번들에 mock 코드가 없음(tree-shaken: `fail@`, `2800`, `fixture=long`이 0건) |
| HTTP client | `web/src/api/http.ts`: FormData multipart(`payload` JSON 문자열 + `product_image` 0..1 / `insight_images` ×3), `X-Request-ID: web-<uuid>`, 클라이언트 timeout 190s. timeout, 사용자 취소(AbortError), 네트워크 오류, malformed 응답을 각각 구분함 |
| 계약 정렬 | 코드 13개를 수정함(`questions.ts` = `ui_option_catalog`, adapter-test로 검증). Q9 max 3, Q18은 단일값 직렬화, `q01…`을 `q1_brand_name…`로 매핑, `contract_version`/`locale`을 보냄. 구 sessionStorage 코드는 `migrateAnswers`로 바꾸며, 알 수 없는 코드는 버리고 max를 강제함 |
| 응답 adapter | `web/src/api/adapters.ts`가 계약 응답 필드를 모두 참조함(제외는 메타데이터 `schema_version`뿐). 화면 변경은 최소로 함: 포지셔닝 "근거" 행, 폰트 "선택 이유" 행, 항목을 "title — description" 형식으로 표시. `guidebookNote`는 만들어 넣지 않고 숨김. 형태가 깨진 응답은 오류로 처리하며 보고서를 렌더링하지 않음 |
| 업로드 | jpeg/png/webp만 허용하고 PDF는 제거함. 진단은 최대 1장, 처방은 정확히 3장일 때만 제출 가능. 전송 직전에 `prepareProductImage`/`prepareInsightImages`를 실행함(INT-D3: 15.7 MB → 1.18 MB) |
| Instagram URL | 백엔드 정규식을 그대로 옮겨 `/reel/` 또는 `/reels/`만 허용함. URL은 맥락 식별자로만 쓰고 영상은 수집하지 않음 |
| 에러 UX | `kind:'input'`을 추가함. 입력 코드 6종은 입력 화면으로 돌려보내고 role=alert 안내를 띄우며 재시도 루프가 없음. `MODEL_TIMEOUT`은 timeout 화면, 나머지 모델 오류와 `INTERNAL_ERROR`, 네트워크 오류는 error 화면과 "다시 시도"로 감. 콘솔에는 `request_id`만 남김 |
| 새로고침과 stale 응답 | 생성 중에 새로고침하면 입력 화면으로 돌아가고 재전송하지 않음(`generationTicket`). unmount되면 요청을 abort함. 늦게 온 응답은 반영하지 않음(INT-D12) |
| 이메일 | 백엔드 엔드포인트가 없음. http 모드에서는 "이메일 발송 기능은 준비 중입니다"를 띄우고 버튼을 비활성화함. `/delivered`로 직접 가도 `/delivery`로 돌려보냄. mock 모드는 레거시 동작을 유지함 |
| Fake 서버 | `SOSU_py/scripts/serve_fake.py`(dev/test 전용, 127.0.0.1 바인딩, `SOSU_ENV=production`이면 기동 거부). 실제 `create_app()`을 쓰며 `get_gateway`만 override함. schema 타입별로 결정론적 응답을 주므로 반복 요청을 무한히 처리함. `/__fake__/{scenario,reset,last-request}`, 응답 헤더 `X-SOSU-Fake: 1`, 시나리오 8종 |
| 가이드북 지식 | KnowledgePack `gb2-5edea367`: 93 rules, 31/45쪽 출처, 18쪽 이미지 확인. `app/knowledge` provider를 진단·처방 **합성 프롬프트**에 별도 블록으로 넣음(`diagnosis-v2`, `prescription-v2`) |
| 리서치 경계 | `app/research`: Protocol, `NullResearchProvider`(기본, 결과를 조작하지 않음), fixture provider. `SOSU_RESEARCH_ENABLED` 게이트. 처방 프롬프트에 별도 `EXTERNAL RESEARCH` 블록을 둠. 라이브 검색은 미구현이며 Phase 2임. SDK google-genai 2.23.0에 `types.Tool(google_search=GoogleSearch())`가 있음을 확인함 |
| 키 없음 가드 (ORCH 감사에서 추가) | `GoogleGenAIGateway.generate_structured`는 키가 없거나 placeholder이면 네트워크 호출 없이 바로 `MODEL_PROVIDER_ERROR`를 냄 |

## 2. 변경 파일

**백엔드 (`SOSU_py`, 커밋 `01497c7`, 35 files, +6208/−13)**
- 신규:
  - `scripts/serve_fake.py`, `scripts/fake_gateway.py`
  - `app/knowledge/{__init__,models,provider}.py`, `app/research/{__init__,models,provider}.py`
  - `tests/test_fake_server.py`, `tests/test_knowledge.py`, `tests/test_research.py`
  - `docs/KNOWLEDGE.md`, `docs/RESEARCH_BOUNDARY.md`
  - `knowledge/guidebook/{knowledgepack.v1.json, knowledgepack.schema.json, style.md, task_mapping.md, coverage.{json,md}, KNOWLEDGE_REPORT.md}`
  - `knowledge/tools/{build_pack.py, validate_pack.py, extract_text.sh, page_chars.json}`
- 수정:
  - `app/config.py` (`sosu_knowledge_path`, `sosu_research_enabled`)
  - `app/gemini/client.py` (키 없음 가드)
  - `app/gemini/prompts/{diagnosis,prescription}.py`
  - `app/services/{diagnosis,prescription}_service.py`
  - `tests/test_gemini_client.py`, `tests/test_pipelines.py`
  - `README.md`, `.gitignore` (`.sprint/`), `.env.example` (새 env 이름 2개)
- 커밋하지 않음: `knowledge/guidebook/READY` (스프린트 마커)

**프론트 (루트 레포 `web/`)**
- 신규:
  - `src/api/{http,adapters,contract}.ts`, `src/vite-env.d.ts`
  - `.env.example`
  - `scripts/adapter-test.mjs`, `scripts/integration-e2e.mjs` (오케스트레이터 작성)
- 수정:
  - `src/api/{client,errors,mock,validation}.ts`
  - `src/data/{questions,report}.ts`
  - `src/state/workflows.tsx`, `src/screens/{survey,prescription}.tsx`, `src/components/blocks.tsx`
  - `scripts/{e2e.mjs, media-test.mjs, lib/harness.mjs}`
  - `package.json` (`test:adapter`, `e2e:integration`, verify에 adapter 추가)

**루트:** 이번에 처음 추적을 시작한 파일들
- `contracts/` (생성물, runtime과 일치 확인)
- `SOSU_STAGE0_ENVIRONMENT_AUDIT.md` 및 Stage 1 문서 4종
- 함께 바뀐 것: submodule 포인터, `STATUS.md`/`HANDOFF.md` 상단 정정

## 3. 크로스스택 아키텍처

```
Browser (React, VITE_API_MODE=http)
  └─ api/client.ts ─ http.ts ── multipart(payload JSON + images, X-Request-ID) ──▶ FastAPI /api/v1/{diagnosis,prescription}
       ▲ adapters.ts (Contract V1 → ViewModel)                                    │ 실제: 검증 → 이미지 정규화 → 충분성 → (관찰) →
       │ errors.ts (code/retryable → input|timeout|error)                         │       EvidencePack + GUIDEBOOK KNOWLEDGE(+EXTERNAL RESEARCH) →
       └──────────────────── SuccessEnvelope / ErrorEnvelope ◀────────────────────┘       합성 → validator → 1회 repair → 공개 모델
                                                                                   GeminiGateway: 프로덕션 GoogleGenAIGateway | 개발 serve_fake 결정론 gateway
```

근거 출처는 서로 섞이지 않게 분리되어 있음.
- 사용자 선언(DECLARED)과 이미지 관찰(OBSERVED)은 EvidencePack에 들어감.
- 가이드북 지식은 별도 블록이며, 버전과 rule_id·쪽 번호를 함께 붙임.
- 외부 리서치도 별도 블록이며, 현재는 "none available"임.
- 모델의 가설과 추천은 출력 쪽에만 있음.
- 처방에서 빠진 수치는 만들어 넣지 않고, 상관관계를 인과로 단정하지 않음. 이 규칙은 프롬프트와 `task_mapping.md`, `style.dont`에 들어 있음.

## 4. 통합 테스트 결과 (요약 — 상세는 TEST MATRIX)

| 구분 | 결과 |
|---|---|
| Backend pytest | 316 passed, 1 skipped(live) |
| ruff / format / mypy / openapi / contract | 모두 PASS |
| KnowledgePack validate | VALID (93) |
| FE typecheck / tokens / lint | PASS (lint 경고 16, 에러 0) |
| FE adapter / media | 9/9, 6/6 |
| 레거시 e2e (mock) | 47/47 |
| **브라우저 통합 (실제 HTTP + fake gateway)** | **20/20** (run3). run2의 1건 실패는 키 투입에 따른 테스트 단정 문제였고 수정함 |
| Live Gemini | NOT RUN |

## 5. 감사 (ORCH-05) — 오케스트레이터 독립 검증

| 점검 | 결과 |
|---|---|
| 계약 필드 정합 | adapter가 모든 응답 필드를 참조함. 요청 mapper가 `diagnosis.request.json`을 재현함(A-FE-4). INT-D2 payload 일치 |
| 프로덕션과 fake 분리 | `app/`에 fake 참조 0건. 프로덕션 `create_app()`의 `/__fake__`는 404이고 `dependency_overrides={}`. serve_fake는 127.0.0.1 바인딩이며 production env에서는 기동을 거부함 |
| 키 미설정 시 가짜 성공 없음 | 프로덕션 앱 + placeholder 키 → `502 MODEL_PROVIDER_ERROR`. 네트워크 호출 없이 실패함(A-BE-7) |
| mock 무성(silent) 폴백 | 없음(INT-D13). http 번들에 mock 코드가 없음 |
| 응답 내용 누락 | 없음(`schema_version` 메타 제외) |
| 이미지 처리 | 실제 multipart 전송, 압축, 크기·개수·타입 검증 확인(INT-D3, P1, P3, P4) |
| 자격 증명 노출 | 변경·신규 파일에서 실제 Gemini 키와 Vercel 토큰 값을 문자열 대조로 찾았고 0건. `AIza…` 패턴도 0건 |
| 가이드북 라우팅 | 두 합성 경로에 들어감. 관찰과 repair에는 넣지 않음. cwd와 무관하게 로드됨 |
| 리서치 주장 | 라이브 검색을 주장하지 않음. Null provider가 "unavailable"을 반환함 |
| 거짓 양성 E2E | 통합 테스트가 실제 응답 JSON의 문자열이 화면에 보이는지, fake 서버가 받은 실제 payload와 파일 크기를 직접 대조함 |
| 테스트 서버 정리 | 실행 후 8000/5196–5199에 남은 프로세스 없음 |

## 6. 남은 갭 / 리스크

1. **Vercel 배포 위험 (중요).** 기본 모드가 http가 되었음. 이 상태로 main을 push해서 Vercel이 다시 빌드하면, 배포본이 `http://127.0.0.1:8000`을 호출하고 모든 생성이 오류가 됨.
   - push 전에 Vercel 프로젝트 env에 `VITE_API_MODE=mock`을 넣어 Mock MVP를 유지해야 함.
   - 또는 공개 백엔드 URL, CORS, 비용 한도를 정한 뒤 `VITE_API_BASE_URL`을 설정해야 함.
   - 이번 스프린트에서는 배포 설정을 바꾸지 않았음.
2. **목소리/TTS 제품 결정.** 가이드북은 TTS를 권장하지만, 현재 Q18 constraint와 validator는 나레이션을 금지함. 지금은 보수적으로 처리함(Knowledge Report §7).
3. **이메일·PDF 발송**은 미구현임. 별도 기능임.
4. **계약 TS 타입은 손으로 작성함.** `02_openapi.json`에서 생성하지 않았으므로 계약이 바뀌면 같이 고쳐야 함. adapter-test가 fixture 기준으로 일부를 막아 줌.
5. **Stage 0의 :5199 간헐 실패**는 재현되지 않았고 원인도 미확인임. 포트 분리로 충돌 가능성만 제거함.
6. **`knowledge/tools` ruff 179건.** 게이트 대상이 아니고 데이터 스크립트의 긴 줄임.
7. **lint 경고 16건.** `react(refs)`, `static-components`, `only-export-components`.
8. **`dist/`**에는 마지막으로 빌드한 모드가 남음. 통합 테스트는 `node_modules/.sosu-integration-dist`를 따로 씀.
9. 가이드북 p14 조합 라벨 중복 등 원문 모호성 12건은 기록만 하고 해결하지 않았음(Knowledge Report §6).

## 7. Git 상태

- 백엔드 `SOSU_py`: `main` `01497c7`(로컬 커밋, **push 안 함**). 이전 HEAD는 `3d19714`(태그 `ai-service-v1-checkpoint-20260913`, 보존됨).
- 루트: submodule 포인터를 `5927c1b`에서 `01497c7`로 갱신함. 루트 커밋 해시는 최종 콘솔 요약에 적음.
- 추적하지 않는 것: 루트 `SSOT/`(이미 추적 중인 `SOSU_py/SSOT/`와 byte 단위로 동일), `가이드북 2차.pdf`(오너 자산, 커밋 금지), `SOSU_py/knowledge/guidebook/READY`(마커).
- 로컬 `deploy` 브랜치는 건드리지 않았음. push와 deploy는 하지 않았음.
