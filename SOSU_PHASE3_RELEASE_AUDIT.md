# SOSU — Phase 3 Release Audit (2026-10-18)

- 시작 14:50:42 KST, 종료 약 15:09 KST(최종 커밋 시각은 콘솔 보고에 있음). 약 19분, 제한 60분.
- 구성: 오케스트레이터(보안·운영 역할 C를 직접 수행. Vercel CLI 권한이 필요했음), Agent A(RD-5), Agent B(RD-6).
- 게이트별 상세: `SOSU_SECURITY_ACTIVATION_MATRIX.md` · RD-5: `SOSU_RD5_GROUNDING_EVIDENCE.md` · 오너 작업: `SOSU_OWNER_FINAL_HANDOFF.md`

## 1. Git / 배포

| 항목 | 값 |
|---|---|
| `Siegfriex/SOSU_py` main (local = remote) | `d345e0d` (이전 `f5680aa`, fast-forward) |
| `Siegfriex/sosu` main (local = remote) | `c4817f7`, 그 뒤 이 보고서를 담은 커밋(콘솔 보고 참고) |
| superproject gitlink | `d345e0d` |
| 백엔드 운영 | `https://sosu-py.vercel.app`, `X-SOSU-Build: d345e0d9c67a`, `/features` build `d345e0d9c67a` |
| 프론트 운영 | `https://sosu-rosy.vercel.app`, `<meta name="sosu-build" content="c4817f7…">` |
| 커밋하지 않은 것 | `SSOT/`, `가이드북 2차.pdf`, `knowledge/guidebook/READY`, `.sprint/`, `.env.local` |

## 2. 구 배포 위험 분류
- 구 배포 `dpl_E4zvKfs1VDwMvJVELxDqvAZF33xR`(3d19714)의 상태는 **"과거 배포 URL이 Vercel Authentication으로 보호됨"**이다.
  - alias가 없다.
  - GET `/api/v1/health` 요청은 302로 SSO에 리다이렉트된다.
  - 프로젝트 보호 범위는 `all_except_custom_domains`이고, bypass 토큰이 없다.
  - 운영 alias는 새 배포만 가리킨다.
- 노출 구간은 2026-10-18 13:52~14:17 KST였다. 운영 alias가 구 배포를 가리키던 시간이다.
- 오너가 해당 구간의 사용량을 확인했고 이상이 없었다. 그래서 키는 교체하지 않았다(오너 결정).
- 구 배포는 롤백 대상에서 제외한다.

## 3. WAF
- 이전 상태는 Firewall "Not configured"였다. CLI로 규칙 1개를 만들어 게시했다(14:52:26).
- 규칙: "SOSU AI combined 3/min/IP" = (POST ∧ `/api/v1/diagnosis`) ∨ (POST ∧ `/api/v1/prescription`), 3 req / 60 s, fixed_window, key=ip, 초과 시 rate_limit.
- 실측(유료 호출 없음, 추론 OFF 상태):
  - 1~3번째 요청(diag, presc, diag)은 앱까지 도달해 503을 받았다.
  - 4번째 요청(presc)은 엣지에서 **429**가 됐다. `x-vercel-mitigated: deny`가 붙었고 함수에는 도달하지 않았다.
  - 60초 뒤 카운터가 리셋된 것을 확인했고, 같은 결과가 재현됐다.
- 엣지 429 응답에는 CORS 헤더가 없어서 브라우저에서는 네트워크 실패로 보인다. 프론트에서 다음과 같이 보완했다(INT-D14).
  - 평문 429는 `RATE_LIMITED`로 매핑한다.
  - 네트워크 실패가 났는데 health는 정상이면 `RATE_LIMITED`로 판단해 "요청이 많아요" 화면과 수동 재시도를 보여준다.
- 앱 내부 인스턴스별 token bucket은 방어 계층으로 그대로 유지한다.

## 4. 비용 상한
- `GEMINI_SPEND_CAP`는 오너가 직접 확인했다(owner-attested, AI Studio 화면 확인, $10). 이 세션에는 AI Studio를 조회할 도구가 없다.
- 청구는 약 10분 지연되므로, 상한을 넘는 지출이 0이라고 보장할 수는 없다.
- Vercel Spend Management 알림은 확인하지 못했다. 설정 방법은 Handoff §1에 있다.

## 5. 품질
- **RD-5: FIXED.** 근거는 두 가지다.
  - 결정론 테스트 29개.
  - 라이브 재검증 1건(15:03): 핸들에서 끌어온 내용 0건, 지표와 계산 정확.
  - 근본 원인: 관찰 단계가 핸들을 노트에 복사했고, 합성 단계가 그것을 사실로 취급한 뒤 smoke→연기, ceramics→도자기로 번역했다. 그 위에 프롬프트의 구체성 압박이 더해졌고, 검증기 검사는 없었다.
  - 수정: `insight-observation-v2`와 `prescription-v3`에 증거 경계를 추가하고 핸들을 가렸다. 검증기 검사 4종을 추가해 위반 시 REPAIRABLE로 판정하고 1회 repair로 넘긴다.
- **RD-6: 60초 채택.** 모든 단계의 timeout과 재시도를 요청 전체 예산(180초)의 남은 시간에서 2초를 뺀 값으로 제한한다. 남은 시간이 3초 미만이면 즉시 실패한다. 최악의 경우 약 178초에 504를 반환하며, Vercel 상한 200초보다 이르다. 결정론 테스트 13개로 확인했다.
  - 운영 env에는 `GEMINI_TIMEOUT_*`가 없어서 코드 기본값 60초가 적용된다.
  - 로컬 `.env.local`에는 45초가 남아 있다.

## 6. 회귀 (모두 순차 실행, rc=0)

| 스위트 | 결과 | Phase 2 기준 |
|---|---|---|
| backend pytest | **401 passed, 1 skipped** | 359/1 (+RD-5 29, +RD-6 13) |
| ruff check / format / mypy | pass / 92 files / 56 files | pass |
| check_openapi / release --check / validate_pack | pass / pass / VALID | 동일 |
| FE typecheck / tokens / lint | pass | 동일 |
| adapter | 12/12 (edge 429 어서션 추가) | 12/12 |
| media | 6/6 | 6/6 |
| legacy e2e (mock) | 47/47 | 47/47 |
| integration (fake API) | **24/24** (INT-D14 추가) | 23/23 |
| live Gemini | 처방 1건 성공(provider 2회) | 진단·처방 각 1건 |

- 테스트 fixture 수정: 오너 `.env.local`의 `SOSU_PUBLIC_INFERENCE_ENABLED=true`가 보안 테스트로 새어 들어가 10건이 실패했다. fixture에서 플래그 값을 명시적으로 고정해 해결했다.

## 7. 운영 기능 플래그 (15:05, `/api/v1/features`)

| 기능 | 상태 |
|---|---|
| inference | **false** (`public_inference_disabled`) |
| email | false |
| image_storage | false |
| research | false |
| knowledge_version | gb2-5edea367 |

## 8. 최종 출시 판정
- **게이트 G1~G12는 모두 PASS다.** G2 사용량과 G3 상한은 오너가 직접 확인한 결과다.
- **공개 활성화는 실행하지 못했다(BLOCKED).** `vercel env add SOSU_PUBLIC_INFERENCE_ENABLED`를 Claude Code 자동 모드 권한 분류기가 [Feature Flag Writes]로 거부했고, 우회하지 않았다.
- 운영은 안전한 503 상태로 남아 있다.
- 오너가 Handoff §4(env 추가와 Redeploy)를 실행하면 즉시 공개된다. 그 뒤 features 확인과 브라우저 스모크 1건은 요청하면 수행한다.
