# SOSU — Vercel Release Audit (2026-10-18)

이 문서의 모든 값은 실제로 확인한 것입니다. 확인 경로는 세 가지입니다.
- GitHub 커밋 status
- Vercel CLI API: CLI 64.5.0으로 14:21경 오너 승인으로 로그인. 이전의 MCP 경로는 403이었음.
- 공개 URL 요청

## 1. SHA / gitlink

| 항목 | 값 |
|---|---|
| 루트 `Siegfriex/sosu` main (local = remote) | 이 문서를 커밋하기 전 기준 `328b195`. 이 문서를 포함한 최종 커밋은 최종 콘솔 보고에 적음 |
| 백엔드 `Siegfriex/SOSU_py` main (local = remote) | `f5680aa` (`f5680aa4f5ea00359ea3b9c2eb9c9d9d8a0d65a3`) |
| 루트 superproject gitlink → SOSU_py | `f5680aa` (`git ls-tree HEAD SOSU_py`) |
| 이전 원격 상태 | sosu `d1f03cf`, SOSU_py `3d19714`. 두 레포 모두 fast-forward로 push함 (force 없음) |
| 추가 원격 브랜치 | `SOSU_py:release/phase2` (`f5680aa`). Preview 빌드용이며 삭제하지 않음 |
| 보존 | 태그 `ai-service-v1-checkpoint-20260913`, 로컬 `deploy` 브랜치 (손대지 않음) |

## 2. 배포

| 프로젝트 | 배포 ID | 대상 | SHA | 상태 | URL / 도메인 |
|---|---|---|---|---|---|
| sosu-py | `dpl_5A9LNfGCpjxNdGyEqBrjd7iUd25E` | **Production** | f5680aa | READY (14:16:51) | https://sosu-py.vercel.app |
| sosu-py | `dpl_3SfR64EAp9bTYCbCk9rtRvA4Ntst` | Preview (`release/phase2`) | f5680aa | READY (14:16:05) | 보호됨 (Vercel Authentication, 302 → SSO) |
| sosu-py | `dpl_E4zvKfs1VDwMvJVELxDqvAZF33xR` | 이전 Production | 3d19714 | READY | ⚠️ 롤백 대상으로 쓰지 말 것 (공개 유료 추론이 열려 있음) |
| sosu | `dpl_8tdjttQPVmbLgaTSzFLyXSJjGFib` | **Production** | 328b195 | READY (14:23:52) | https://sosu-rosy.vercel.app |
| sosu | `dpl_GGaPbZhU3A7eajf7rrXUuX6wvTSj` | Production 시도 | 1257ae6 | ERROR | `vite: command not found` (아래 §4) |
| sosu | `dpl_5HLDNbkYp6MvL5GMWJ7aGxK6zz9D` | 이전 Production | d1f03cf | READY | 프론트 롤백 대상 (mock MVP) |

## 3. 라우트와 기능 점검 (공개 URL, 유료 호출 없음)

| 점검 | 결과 |
|---|---|
| 백엔드 `/` | 404. FastAPI에 루트 라우트가 없어서 나는 정상 응답 |
| `/api/v1/health` | 200 `{"status":"ok","contract_version":"1.0","gemini_configured":true}` |
| `/api/v1/features` | inference false (`public_inference_disabled`), email false (`resend_not_configured`), image_storage false, research false, `knowledge_version=gb2-5edea367`, `build=f5680aa4f5ea` |
| `X-SOSU-Build` 헤더 | `f5680aa4f5ea`. 배포 SHA와 일치함 |
| `/docs`, `/openapi.json` | 200 (배포 전 확인) |
| `POST /api/v1/diagnosis`, `/prescription` | 503 `SERVICE_UNAVAILABLE`. 게이트가 요청 본문을 파싱하기 전에 차단함 |
| `/__fake__/*` | 404 |
| CORS (Origin `https://sosu-rosy.vercel.app`) | preflight 200, allow-origin 일치. `/diagnosis`, `/report-email` 모두 확인 |
| 프론트 `<meta name="sosu-build">` | `328b1950757a…`. 배포 SHA와 일치함 |
| 프론트 번들 | `https://sosu-py.vercel.app`를 참조함. mock 흔적(`fail@`, `fixture=long`) 없음. localhost 참조 없음 |
| 프론트 `/survey/step/1`, `/prescription` @360 | 로드 성공, 가로 오버플로 없음, 콘솔 에러 없음 |
| 운영 UI에서 진단 제출 | API 503 `SERVICE_UNAVAILABLE`. 화면은 `/survey/error`이고 "지금은 AI 진단 서비스를 준비 중이에요"를 표시함. 재시도 버튼 0개, 가짜 결과 없음 (스크린샷 `web/scripts/shots/prod-smoke/prod_ui_service_unavailable.png`) |
| `npm run smoke:prod` | **10/10** |

## 4. 설정 점검과 변경 사항

| 항목 | 확인 결과 |
|---|---|
| GitHub 연동 | sosu → `Siegfriex/sosu`, sosu-py → `Siegfriex/SOSU_py`. 둘 다 production branch는 `main` |
| **sosu Root Directory** | **null이었음.** 이 때문에 Git 배포가 `vite: command not found`로 실패함. **14:22에 `web`으로 변경함** (`PATCH /v9/projects/sosu {"rootDirectory":"web"}`). 이후 Git 배포 READY. HANDOFF에 적힌 "Root Directory web"은 실제 설정과 달랐음 |
| sosu framework / node | vite / 24.x |
| sosu env | 없음. 그래서 운영 API 주소는 tracked 파일 `web/.env.production`이 결정함 |
| sosu-py framework / node | fastapi / 24.x (Python 런타임 버전은 Vercel이 선택하며 확인하지 않음. RD-9 참고) |
| sosu-py env (이름과 대상만) | `GEMINI_API_KEY` (production, preview). 그 외 SOSU_*, RESEND_* 없음. CORS는 코드 기본값으로 동작함 |
| Function maxDuration | `SOSU_py/vercel.json`: `app/main.py` 200s. 빌드는 수락됨. 실제 플랜 상한은 확인하지 않음 |
| 4.5MB 본문 제한 | 앱이 4,000,000B에서 먼저 413을 반환함. 처방 3장의 합계 상한은 2.7MB |
| KnowledgePack 포함 | 배포된 런타임에서 `knowledge_version=gb2-5edea367`을 확인함 |
| Deployment Protection | Preview에만 Vercel Authentication이 걸려 있음. Production 도메인은 공개 |
| CLI 운영 직접 재배포 | 자동 모드 권한 분류기가 거부함. Git push 경로로 대체함 |

## 5. 롤백 방법

- 프론트: Vercel 대시보드 → sosu → Deployments → `dpl_5HLDNbkYp6MvL5GMWJ7aGxK6zz9D` → Instant Rollback (mock MVP로 돌아감).
- 백엔드: **`dpl_E4zvKfs1…`(3d19714)로 롤백하지 말 것.** 공개 유료 추론이 다시 열림. 문제가 생기면 `f5680aa`에서 수정 커밋을 push해 앞으로 고칠 것.

## 6. 오너가 할 일 (`SOSU_REMAINING_DECISIONS.md` 참고)

1. **RD-1:** WAF 레이트 리밋 규칙을 만들고, Gemini와 Vercel 지출 한도를 설정한 뒤 `SOSU_PUBLIC_INFERENCE_ENABLED=true`를 sosu-py production env에 넣고 재배포할 것. 이 단계 전까지 공개 AI 생성은 503임.
2. **RD-2:** Resend 발신 도메인을 인증하고 `RESEND_API_KEY`, `SOSU_EMAIL_FROM`, `SOSU_DELIVERY_SIGNING_SECRET`, `SOSU_PUBLIC_EMAIL_ENABLED=true`를 설정할 것.
3. **RD-8:** 13:52~14:17 KST의 Gemini 사용량을 확인하고, 이상이 있으면 키를 교체할 것.
4. (선택) `SOSU_CORS_ORIGINS=https://sosu-rosy.vercel.app`를 명시할 것. 지금은 코드 기본값으로 동작함.
