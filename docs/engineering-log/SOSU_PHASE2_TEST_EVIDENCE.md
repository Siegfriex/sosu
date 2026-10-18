# SOSU — Phase 2 Test Evidence (2026-10-18)

- 표의 결과는 모두 실제로 실행해서 얻은 것이다. 백엔드 pytest는 `GEMINI_API_KEY=PASTE_YOUR_GEMINI_API_KEY_HERE RUN_LIVE_GEMINI_TESTS=0` 환경에서 돌렸다. 환경변수가 `.env.local`의 실제 키보다 우선하므로 유료 호출은 0건이다.
- 증거 로그 위치는 다음과 같다. 모두 gitignored라 로컬에만 있다.
  - `web/scripts/shots/p2_*.log`
  - `web/scripts/shots/prod-smoke/results.json`
  - `SOSU_py/.sprint/{live_smoke_result.json, model_discovery.json, smoke_inputs/}`

## 1. 로컬 회귀 게이트 (오케스트레이터 독립 재실행)

| 명령 (cwd) | rc | 시간 | 결과 | Stage 1 기준 |
|---|---|---|---|---|
| `.venv/bin/pytest -q -o addopts=""` (SOSU_py) | 0 | 13.1s | **359 passed, 1 skipped**, 2 warnings | 316/1 → 신규 43개 (security, email, features, fake server 등) |
| `.venv/bin/ruff check app tests scripts` | 0 | <1s | All checks passed | 동일 |
| `.venv/bin/ruff format --check app tests scripts` | 0 | <1s | 90 files already formatted | 77 → 90 |
| `.venv/bin/mypy` | 0 | <2s | no issues in 56 source files | 47 → 56 |
| `.venv/bin/python scripts/check_openapi.py` | 0 | <1s | matches runtime | 동일 |
| `.venv/bin/python scripts/release_shared_contract.py --check` | 0 | <1s | root contracts matches runtime | 동일 |
| `.venv/bin/python knowledge/tools/validate_pack.py` | 0 | <1s | VALID (93 rules) | 동일 |
| `npm run typecheck` (web) | 0 | 1s | 0 error | 동일 |
| `npm run tokens:check` | 0 | 1s | up to date | 동일 |
| `npm run lint` | 0 | <1s | 0 error, 경고 3건 (refs 패턴, 기존 코드) | 경고 16 → 3 |
| `npm run test:adapter` (:5196) | 0 | 2s | **12/12** (error fixture 15종 포함) | 9 → 12 |
| `npm run test:media` (:5198) | 0 | 6s | **6/6** | 동일 |
| `npm run e2e` (:5199, mock) | 0 | 50s | **47/47** | 동일 |
| `npm run e2e:integration` (fake API :8000 + :5197) | 0 | 48s | **23/23** | 20 → 23 (X1 503 준비 중 UX, X2 이메일 요청 본문과 /delivered, X3 이메일 비활성) |

- 위 7개 프론트 명령은 순차 실행했다. 실행 후 8000/5196~5199 포트에 남은 프로세스는 없었다.
- Agent A가 e2e와 e2e:integration을 동시에 돌렸을 때 npm 오류(rc=254)가 1회 발생했다. 각각 단독으로 돌리면 통과했다. 원인은 확인하지 못했고, 동시 실행 시 npm 캐시나 빌드 경합으로 추정한다. 따라서 이 두 명령은 동시에 돌리지 않는 것을 권장한다.

## 2. Gemini 모델 확인 (무료)

- SDK는 google-genai 2.23.0, Python은 3.12.3이다.
- 실제 키로 `models.list()`를 호출해 63개 모델을 받았다. 설정값 `gemini-3.8-flash`가 목록에 **존재한다**: generateContent, 입력 1,048,576 / 출력 65,536 토큰, thinking 지원.
- thinking_level `low`와 `medium`은 400 없이 수락됐다. `minimal`과 `high`는 시험하지 않았다.

## 3. 라이브 Gemini 스모크 (유료, 상한 적용)

- 명령: `cd SOSU_py && .venv/bin/python scripts/live_smoke.py`. 1회만 실행했다.
- 상한은 SDK `client.aio.models.generate_content`에 카운팅 래퍼를 씌워 **전체 8회로 강제**했다. tenacity 재시도도 이 카운트에 포함된다.
- 입력은 Pillow로 만든 합성 데이터다. 청자 머그 그림 1장과 한글 "릴스 인사이트" 스크린샷 3장을 썼고, 지표는 서로 일관되게 맞췄다(조회 12,480 등). 오너 자료는 쓰지 않았다.

| 워크플로우 | 결과 | 총 지연 | 호출 내역 (prompt_version · thinking · 지연 · 토큰 prompt/output/thoughts/total) |
|---|---|---|---|
| 진단 | **성공**, validator 1차 PASS, repair 없음 | 29.1s | visual-observation-v1 · low · 5.5s · 1499/296/–/1795 ; diagnosis-v2 · medium · 23.6s · 6112/2362/739/9213 |
| 처방 | **성공**, validator 1차 PASS, repair 없음 | 46.9s | insight-observation-v1 · low · 27.2s · 3695/1018/–/4713 ; prescription-v2 · medium · 19.7s · 5114/698/1773/7585 |

- **provider 호출은 총 4/8회**이고 재시도는 0회였다. 총 토큰은 23,306이다.
- 비용은 산정하지 않았다. 로컬 문서와 SDK에 이 모델의 공식 단가가 없다.
- 지식 버전은 `gb2-5edea367`이다. 진단에 27개 규칙(6,106자), 처방에 24개 규칙(6,064자)이 들어갔다. rule_id 목록은 `SOSU_py/docs/LIVE_SMOKE.md`에 있다.
- 품질 평가 (`SOSU_py/docs/LIVE_SMOKE.md`):
  - **진단**: 설문을 충실히 반영했다. face_only 조건을 지켜 목소리를 쓰지 않았다. 합성 이미지가 2D 그래픽이라는 점을 스스로 밝혔다. 가이드북 규칙(3초 훅, 완성품→소재→과정 구조, 2~3초 컷, 45° 조명, 캡션/CTA)이 출력에 보인다. 성과를 보장하는 표현은 없다.
  - **처방**: 지표 18개를 모두 정확히 읽었고, 지어낸 수치는 없다. 인과는 유보적으로 표현했다. 다만 화면의 계정 핸들만 보고 **영상 내용을 지어냈다**(예: "연기를 입히는", "화병"). 이 문제는 RD-5로 남긴다.
- 스키마가 유효하다고 해서 추천이 옳다는 뜻은 아니다. 품질 판단은 합성 데이터 1건에 대한 정성 평가일 뿐이다.

## 4. 운영 공개 URL 검증 (비유료)

### 백엔드 `https://sosu-py.vercel.app` — 커밋 `f5680aa` 배포 후 (14:17 KST)

| 점검 | 결과 |
|---|---|
| `GET /api/v1/health` | 200, `gemini_configured:true` |
| `GET /api/v1/features` | `inference.enabled=false (public_inference_disabled)`, `email.enabled=false (resend_not_configured)`, `image_storage.enabled=false`, `research.enabled=false`, **`knowledge_version=gb2-5edea367`**, `build=f5680aa4f5ea` |
| 응답 헤더 `X-SOSU-Build` | `f5680aa4f5ea` (배포 SHA와 일치) |
| `POST /api/v1/diagnosis` (빈 답변) | **503 SERVICE_UNAVAILABLE**. 게이트가 요청 파싱 전에 차단하므로 Gemini 호출 없음 |
| `POST /api/v1/report-email` `{}` | 422 (검증 실패, 발송 없음) |
| `GET /__fake__/scenario` | 404 |
| CORS preflight (Origin `https://sosu-rosy.vercel.app`) | 200, `access-control-allow-origin: https://sosu-rosy.vercel.app` |
| `npm run smoke:prod` (Agent A, 14:18, 프론트 재배포 전) | 8/10. 백엔드 항목은 모두 OK. 실패 2건(빌드 meta 없음, 번들에 sosu-py 참조 없음)은 프론트가 아직 `d1f03cf` mock 번들이라 생긴 예상된 실패 |

배포 전 상태(`3d19714`, 13:52~14:17 KST): `gemini_configured:true`이고 **게이트와 레이트 리밋이 없는 공개 유료 추론**이 열려 있었다. `f5680aa` 배포로 닫았다(RD-8).

### 프론트 `https://sosu-rosy.vercel.app`

- 1차 Git 배포 `dpl_GGaPbZhU3A7eajf7rrXUuX6wvTSj` (`1257ae6`): **ERROR**. 로그는 `sh: line 1: vite: command not found`, `Command "vite build" exited with 127`이었다. 프로젝트 `rootDirectory`가 null(레포 루트)이라 의존성이 설치되지 않은 것이 원인이다.
- 14:22에 Vercel API로 `rootDirectory=web`을 설정했다. CLI로 운영에 직접 재배포하는 것은 권한 분류기가 거부했으므로, main push로 재배포했다.
- 2차 Git 배포 `dpl_8tdjttQPVmbLgaTSzFLyXSJjGFib` (`328b195`): **READY** (14:23:52). `<meta name="sosu-build" content="328b1950…">`로 SHA를 확인했다.
- `BASE_URL=https://sosu-rosy.vercel.app API=https://sosu-py.vercel.app npm run smoke:prod`: **10/10, rc=0** (6s). 확인한 항목은 다음과 같다.
  - health, features, CORS 2건
  - 빈 진단 → 503, 처방 2장 → 503
  - 두 라우트 @360 정상, 콘솔 에러 없음
  - build meta 존재
  - 번들이 sosu-py를 참조하고 mock 흔적이 없음
- 운영 UI 브라우저 확인(puppeteer, 오케스트레이터): 문진 → 진단 제출 → API 503 `SERVICE_UNAVAILABLE` → `/survey/error`에 "지금은 AI 진단 서비스를 준비 중이에요"가 표시됐다. 재시도 버튼 0개, 가짜 보고서 없음. 스크린샷: `web/scripts/shots/prod-smoke/prod_ui_service_unavailable.png`.

## 5. 실행하지 않은 것 (NOT RUN)

- 운영 URL에 대한 유료 진단/처방: 공개 추론이 차단되어 있고(정책), 지시서상 라이브 테스트는 2건으로 한정된다.
- 실제 이메일 발송: 자격 증명이 없고, 임의 주소로 발송하는 것은 금지되어 있다.
- 부하·동시성 테스트: 금지되어 있다.
- 보호된 백엔드 Preview(`release/phase2`)의 기능 확인: Vercel Authentication 때문에 302가 났고, MCP bypass는 403이었다. 빌드 성공만 확인했다.
