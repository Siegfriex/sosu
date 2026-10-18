# SOSU — Phase 2 Final Report

- 실행 시간: 2026-10-18 14:04:43 KST 시작, 14:26경 종료 (약 22분, 제한 60분)
- 진행 방식: 오케스트레이터 1명과 병렬 에이전트 3개
  - A: 프론트
  - B: Gemini와 FastAPI
  - C: 보안, 이메일, 스토리지
- 증거 문서: `SOSU_PHASE2_TEST_EVIDENCE.md`, `SOSU_VERCEL_RELEASE_AUDIT.md`, `SOSU_REMAINING_DECISIONS.md`

## 1. Phase 1 기준선 재확인

| 항목 | 결과 |
|---|---|
| 시작 시점 HEAD | root `b22b361`, backend `01497c7`, gitlink `01497c7`. 원격은 `d1f03cf` / `3d19714` (각각 로컬보다 1커밋 뒤) |
| 원격 독립 변경 | 없음 (fetch 후 ancestry 확인) |
| Stage 1 보고서 4종과 Stage 0 감사 문서 | 모두 존재 |
| 특수 파일 | 루트 `SSOT/`(중복), `가이드북 2차.pdf`, `knowledge/guidebook/READY` 모두 커밋하지 않음 |

## 2. 상태 판정

| # | 영역 | 상태 | 근거 |
|---|---|---|---|
| 1 | 프론트 통합 | **PRODUCTION DEPLOYED** (`328b195`). 공개 E2E는 **차단 상태 UX까지 검증**함 | smoke:prod 10/10, 운영 UI 503 → "준비 중" |
| 2 | FastAPI 통합 | **PRODUCTION DEPLOYED** (`f5680aa`). 로컬에서 **LOCALLY VERIFIED** | pytest 359/1, 통합 E2E 23/23, `/features`·`X-SOSU-Build` 일치 |
| 3 | 가이드북 추론 | **LIVE GEMINI VERIFIED**(로컬) + 운영 런타임 로드 확인 | 라이브 진단 27개 규칙, 처방 24개 규칙 주입. 운영 `knowledge_version=gb2-5edea367` |
| 4 | 라이브 Gemini 진단 | **LIVE GEMINI VERIFIED** (로컬, 실제 키) | 29.1s, 2회 호출, validator 1차 PASS |
| 5 | 라이브 Gemini 처방 | **LIVE GEMINI VERIFIED** (로컬, 실제 키). 품질 이슈 RD-5 | 46.9s, 2회 호출, 지표 18/18 정확, 영상 내용을 지어낸 문제 1건 |
| 6 | 이메일 발송 | **IMPLEMENTED / LOCALLY VERIFIED / DISABLED** (운영) | fake provider 테스트와 통합 X2. Resend 자격 증명 없음 → 503, UI "준비 중" |
| 7 | 동의 기반 이미지 저장 | **DISABLED** (설계 문서만 있음) | `SOSU_py/docs/IMAGE_STORAGE.md`, RD-3 |
| 8 | 공개 남용 방지 | **BLOCKED → 공개 추론 DISABLED** (fail-closed) | 공유 레이트 리밋(WAF)이 없음. 인스턴스별 bucket과 4MB 상한만 있음. 운영 생성은 503 |
| 9 | GitHub 동기화 | **완료**: local = remote (fast-forward, force 없음) | §5 |
| 10 | Vercel 운영 배포 | **PRODUCTION DEPLOYED** (두 프로젝트 모두 READY, SHA 일치). 단 **공개 AI 생성은 정책상 차단** | Release Audit §2–3 |

**Phase 2 판정: 코드와 배포는 완료. 공개 AI 서비스는 미개방.**
- 실제 Gemini로 두 워크플로우가 동작함을 로컬에서 확인했다.
- 운영 배포는 안전하게 마쳤다.
- 공개 유료 추론은 공유 레이트 리밋이 없어 의도적으로 닫아 두었다.
- **Production readiness: NOT READY (공개 AI 생성 기준).** 오너가 RD-1을 수행하면 설정 변경만으로 열 수 있다.

## 3. 에이전트별 작업

| 에이전트 | 결과 |
|---|---|
| **B (Gemini/FastAPI)** | `models.list` 확인(63개, `gemini-3.8-flash` 존재). `scripts/live_smoke.py`(SDK 호출 상한 8회). 라이브 진단과 처방 각 1건 성공. `docs/LIVE_SMOKE.md`(정직한 품질 평가). `vercel.json`(maxDuration 200s, excludeFiles). `docs/VERCEL.md` |
| **C (보안/이메일/스토리지)** | 아래 표 참고 |
| **A (프론트)** | `web/.env.production`(운영 API 주소, tracked). `sosu-build` meta. SERVICE_UNAVAILABLE / RATE_LIMITED / EMAIL_DELIVERY_FAILED 화면 처리. `delivery_token` 보관과 `/features` 기반 이메일 UI. 테스트: adapter 12, 통합 23. `smoke:prod`(비유료 운영 검사) |
| **오케스트레이터** | 아래 표 참고 |

Agent C의 작업:
- 공개 런타임(Vercel 또는 production)에서 AI 라우트를 fail-closed로 막는 게이트. `SOSU_PUBLIC_INFERENCE_ENABLED`로 연다.
- 4MB 본문 상한(413).
- 인스턴스별 token bucket(429 `RATE_LIMITED`. 공유 한도가 아니라 보조 장치).
- `X-SOSU-Build` 헤더, `GET /api/v1/features`.
- `POST /api/v1/report-email`:
  - HMAC `delivery_token`, 서버 측 렌더링, idempotency.
  - Resend provider. 자격 증명이 없으면 503.
- 이미지 저장 설계 문서.
- 계약 확장(가산적 변경, 생성 스크립트로 재생성). 기본 CORS에 `https://sosu-rosy.vercel.app` 추가.

오케스트레이터의 작업:
- 기준선 점검과 공개 상태 감사. 구 운영 백엔드의 공개 유료 추론 노출을 발견했다.
- 독립 게이트 재실행.
- 시크릿 스캔(0건).
- 커밋 3개와 push.
- Vercel 문제 진단과 조치: `sosu` Root Directory가 null이라 Git 배포가 실패하던 것을 `web`으로 고쳤다.
- 운영 검증과 보고서 작성.

## 4. 주요 사실과 리스크

1. **구 운영 백엔드가 공개 유료 추론에 노출되어 있었다.** `3d19714`, 13:52~14:17 KST. 게이트와 레이트 리밋 없이 키가 설정된 상태였다. `f5680aa` 배포로 닫았다. 사용량은 오너가 확인해야 한다(RD-8).
2. **프론트 Git 배포가 계속 실패하던 원인은 Root Directory 미설정이었다.** 수정 후 정상 배포됐다. HANDOFF의 "Root Directory web" 기재는 실제와 달랐다.
3. **GitHub 두 레포는 public이다.** 오너 결정에 따라 KnowledgePack(가이드북 요약 규칙 93개)이 공개됐다. 원본 PDF는 올리지 않았다.
4. Vercel MCP는 이번 세션에서 403이었다. 14:21 오너 승인으로 CLI에 로그인한 뒤 설정 조회·변경을 했다. CLI로 운영에 직접 배포하는 것은 권한 분류기가 거부해 Git 경로를 썼다.
5. 라이브 비용은 산정하지 않았다. 토큰 23,306개만 기록했고, 공식 단가는 확인하지 못했다.
6. maxDuration 200s의 플랜 상한, Python 런타임 버전, 동시 실행 시 npm rc=254는 확인하지 못했다.

## 5. Git 상태

| 레포 | local = remote | 이번 Phase 커밋 |
|---|---|---|
| SOSU_py | `f5680aa` | `01497c7`(Stage 1, 이번에 push), `f5680aa`(Phase 2) |
| sosu | 최종 콘솔 보고에 기록 | `b22b361`(Stage 1, 이번에 push), `1257ae6`, `328b195`, 그리고 이 보고서들을 담은 최종 커밋 |

- gitlink는 `f5680aa`다.
- 추가 원격 브랜치는 `SOSU_py:release/phase2`다.
- 추적하지 않는 것: `SSOT/`, `가이드북 2차.pdf`, `SOSU_py/knowledge/guidebook/READY`, `.sprint/`(gitignored).

## 6. 변경 파일 (Phase 2)

- **SOSU_py `f5680aa`** (35 files):
  - 신규: `app/security/*`, `app/email/*`, `app/api/delivery.py`
  - 수정: `app/{main,config}.py`, `app/contracts/envelope.py`, `app/domain/errors.py`, `app/api/v1.py`
  - 신규: `tests/test_{security,email,features}.py`
  - 수정: `tests/test_openapi.py`, `scripts/{make_fixtures,release_shared_contract}.py`
  - 신규: `scripts/live_smoke.py`, `vercel.json`, `docs/{SECURITY,EMAIL,IMAGE_STORAGE,LIVE_SMOKE,VERCEL}.md`
  - 수정: `contracts/**`, `.env.example`
- **sosu `1257ae6` / `328b195` / 최종 커밋**:
  - `web/{.env.production,.gitignore,.env.example,vite.config.ts,package.json}`
  - `web/src/api/{contract,errors,http,client,mock}.ts`, `web/src/state/workflows.tsx`, `web/src/components/blocks.tsx`, `web/src/screens/{survey,prescription}.tsx`
  - `web/scripts/{adapter-test,integration-e2e,prod-smoke}.mjs`
  - `contracts/{01,02,03}`, gitlink
  - Phase 2 보고서 4종

## 7. 오너가 할 일 (순서대로)

1. Google AI Studio에서 13:52~14:17 KST 사용량을 확인하고, 이상이 있으면 키를 교체한다(RD-8).
2. Gemini 결제 한도와 알림, Vercel Spend Management를 설정한다.
3. Vercel → sosu-py → Firewall에서 rate-limit 규칙을 만든다. `/api/v1/diagnosis`, `/api/v1/prescription`은 IP당 60초에 3~5회, `/api/v1/report-email`은 IP당 10분에 3회를 권장한다.
4. sosu-py production env에 `SOSU_PUBLIC_INFERENCE_ENABLED=true`를 넣고 재배포한다. 이후 `/api/v1/features`의 `inference.enabled`가 `true`인지 확인한다.
5. (이메일) Resend 도메인을 인증하고 `RESEND_API_KEY`, `SOSU_EMAIL_FROM`, `SOSU_DELIVERY_SIGNING_SECRET`(`openssl rand -hex 32`), `SOSU_PUBLIC_EMAIL_ENABLED=true`를 설정한 뒤 재배포한다.
6. 결정이 필요한 항목: RD-3(이미지 저장), RD-4(TTS), RD-5(처방 근거 강화를 개방 전에 할지), RD-6(관찰 timeout).
