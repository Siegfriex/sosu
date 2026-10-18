# SOSU — Security Activation Matrix (Phase 3, 2026-10-18)

판정 기준은 다음과 같다.
- **PASS**: 도구로 독립 검증했다.
- **PASS (owner-attested)**: 도구로는 검증할 수 없고, 오너가 직접 확인했다고 응답했다(15:00경 질의).
- **FAIL / UNVERIFIED**: 해당 없음.

| Gate | 판정 | 증거 | 조치 | 남은 오너 작업 | 출시 차단 |
|---|---|---|---|---|---|
| G1 구 배포 노출 평가·완화 | **PASS** | 구 배포 `dpl_E4zvKfs1…`(3d19714)의 alias는 `[]`. 운영 alias(`sosu-py.vercel.app` 등)는 새 배포에 붙어 있음. 프로젝트 `ssoProtection=all_except_custom_domains`, `protectionBypass` 없음. `GET https://sosu-b9kv26rjs-…/api/v1/health` → **302 SSO** (GET만 사용, 유료 호출 없음) | 노출 구간은 13:52~14:17 KST(운영 alias가 구 배포를 가리키던 시간). 이후 `f5680aa` 배포로 차단 | 구 배포 삭제는 선택(오너 승인 필요). **구 배포로 롤백 금지** | 아니오 |
| G2 키가 보호되지 않은 구 배포로 계속 쓰일 위험 | **PASS** (구 배포 보호는 독립 검증, 사용량은 owner-attested) | 구 배포 URL은 SSO 보호. 오너 응답: "교체 안 함 — 사용량 확인 결과 이상 없음" | 키는 교체하지 않음(오너 결정) | 이상 징후가 보이면 교체(Handoff §2) | 아니오 |
| G3 Gemini 프로젝트 월 $10 상한 | **PASS (owner-attested)** | 오너 응답: "설정 완료·화면 확인함". 이 세션에는 AI Studio 접근 도구가 없음 | — | 정기 확인. 청구 데이터는 약 10분 늦게 반영되므로 상한을 소폭 넘을 수 있음 | 아니오 |
| G4 공유 WAF 레이트 리밋 활성 | **PASS** | `vercel firewall status`: Firewall Enabled, Rules 1 active. 규칙명 "SOSU AI combined 3/min/IP", 14:52:26 KST publish | 이번 Phase에서 생성·게시함(이전에는 "Not configured") | — | 아니오 |
| G5 진단·처방 합산 카운터 | **PASS** | 규칙 1개. 조건 그룹 2개를 OR로 묶음: (method=POST AND path=/api/v1/diagnosis), (method=POST AND path=/api/v1/prescription). 3 req / 60 s, fixed_window, key=ip, 초과 시 rate_limit | — | — | 아니오 |
| G6 유료 호출 없이 강제 동작 시험 | **PASS** | 14:52:59~14:53:00 같은 IP로 diag→presc→diag는 503(앱, `X-SOSU-Build` 있음), 4번째 presc는 **429 `x-vercel-mitigated: deny`**(엣지 icn1, 함수 미도달, 본문 `Too Many Requests`). 14:55:29 리셋 후 같은 패턴 재현. 엣지 429에는 CORS 헤더가 없음 → 프론트를 수정해 "요청이 많아요"로 매핑(INT-D14) | 프론트 `c4817f7` 배포 | — | 아니오 |
| G7 RD-5 근거 이탈 수정 | **PASS** | 결정론 테스트 29개(`tests/test_rd5_grounding.py`). **라이브 재검증 1건**(15:03, 같은 합성 입력, provider 2회): 핸들 유래 명사 0, 지표와 완주율 계산 정확 | `d345e0d` | — | 아니오 |
| G8 회귀 테스트 | **PASS** | 백엔드 pytest 401 passed / 1 skipped, ruff, format, mypy, openapi, contract, pack 모두 통과. 프론트 typecheck, tokens, lint, adapter 12/12, media 6/6, e2e 47/47, integration 24/24 (모두 순차 실행) | 테스트 fixture의 `.env.local` 누출 수정 | — | 아니오 |
| G9 배포 SHA = 리뷰한 소스 | **PASS** | 백엔드 `X-SOSU-Build: d345e0d9c67a` = `SOSU_py` main `d345e0d`. 프론트 `<meta sosu-build>` `c4817f7…` = `sosu` main `c4817f7`. gitlink는 `d345e0d` | — | — | 아니오 |
| G10 시크릿 비노출 | **PASS** | 운영 프론트 번들에 키 값 0, `AIza…` 0, `GEMINI_API_KEY` 0. 두 레포 전체 히스토리 `git log -S<key>` 0건. 변경 파일 스캔 0건. 앱 로그는 request_id, path, error code만 기록 | — | — | 아니오 |
| G11 이메일·이미지 저장 비활성 | **PASS** | `/api/v1/features`: email.enabled=false, image_storage.enabled=false, research.enabled=false | — | — | 아니오 |
| G12 mock 폴백 없음 | **PASS** | 운영 번들에 mock 흔적 0. INT-D13(API 불가 → 오류 화면). 운영 UI 제출 → 503 "준비 중"(Phase 2) | — | — | 아니오 |

## 활성화 단계 상태

- G1~G12가 모두 충족됨.
- **`SOSU_PUBLIC_INFERENCE_ENABLED=true` 설정은 수행하지 못함.** Claude Code 자동 모드 권한 분류기가 `vercel env add`를 "[Feature Flag Writes]"로 거부했고, 우회하지 않음.
- 현재 운영은 `inference.enabled=false`(503)인 안전 상태.
- 오너 작업은 `SOSU_OWNER_FINAL_HANDOFF.md` §4에 정리함.
