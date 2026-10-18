# SOSU — Remaining Decisions (Phase 2 종료 시점, 2026-10-18)

이 문서에는 아직 정해지지 않은 결정만 담았습니다. 이미 고정된 결정(Vercel 호스팅, 외부 리서치 비활성, 가이드북 필수, 동의 기반 이미지 저장 원칙, public 레포 push)은 다시 묻지 않습니다.

| ID | 사안 | 선택지 | 권장 | 이유 | 운영상 결과 | 공개 출시 차단 여부 |
|---|---|---|---|---|---|---|
| RD-1 | **공개 AI 추론 레이트 리밋 값과 개방 시점** | (a) Vercel WAF rate-limit 규칙(IP 기준)을 설정한 뒤 `SOSU_PUBLIC_INFERENCE_ENABLED=true` 설정 (b) 계속 차단 | (a). `/api/v1/diagnosis`, `/api/v1/prescription`은 IP당 60초에 3~5회, `/api/v1/report-email`은 IP당 10분에 3회. Gemini 결제 한도와 알림, Vercel Spend Management도 함께 설정 | 서버리스 인스턴스 사이에서 공유되는 한도는 WAF만 강제할 수 있음. 앱에 있는 token bucket은 인스턴스별 백스톱일 뿐임 | 개방 전까지 생성 요청은 503이고, UI는 "준비 중"으로 안내함 | **차단** (오너가 할 일) |
| RD-2 | **이메일 발송 인프라** | (a) Resend 계정과 발신 도메인 인증 후 env 4개 설정 (b) 이메일 기능 보류 | (a) | 코드와 테스트는 완료됨(서명 토큰, 서버 측 렌더링, idempotency). 남은 것은 자격 증명과 도메인뿐 | 설정 전까지 이메일은 503이고, UI는 "준비 중"으로 표시함 | 이메일 기능만 차단 |
| RD-3 | **동의 기반 이미지 저장** | (a) Vercel Blob(private) + claim token + 보관 기간 + 삭제 API 구현 (b) 저장하지 않음(현재) | 보관 기간과 동의 문구를 먼저 정한 뒤 (a) | 사용자 계정이 없어 소유 확인 수단과 보관 정책이 정해지지 않음. 설계는 `SOSU_py/docs/IMAGE_STORAGE.md` | 이미지는 요청 처리 중 메모리에서만 다룸 | 차단 아님 |
| RD-4 | **목소리/TTS 정책 (Q18)** | (a) 현행 유지: 목소리 불가면 나레이션과 TTS 모두 금지 (b) TTS 허용(가이드북 GB-MUSIC-005, GB-BRAND-005 권장) | 오너 판단 | 가이드북과 현재 constraint 및 validator가 충돌함. TTS를 허용하려면 constraint 문구와 validator를 함께 바꿔야 함 | 현재는 자막, 화면 텍스트, BGM으로 대체하도록 지시함 | 차단 아님 |
| RD-5 | **처방 출력의 근거 이탈** | (a) prescription 프롬프트를 강화하고, 관찰되지 않은 영상 내용을 단정하는지 validator로 검사 (b) 현행 유지 | (a) | 라이브 스모크에서 지표 18개는 정확했지만, 계정 핸들만 보고 영상 내용(예: "연기를 입히는", "화병")을 지어냄(`SOSU_py/docs/LIVE_SMOKE.md`) | 사용자가 사실이 아닌 영상 묘사를 받을 수 있음 | 권장 수정 (추론 개방 전) |
| RD-6 | **관찰 단계 timeout 여유** | (a) `GEMINI_TIMEOUT_OBSERVE`를 45s에서 60s로 (b) 유지 | (a) 검토 | 처방 인사이트 관찰이 27.2s 걸려 한도의 60%를 씀(깨끗한 합성 스크린샷 기준) | 실제 캡처로는 `MODEL_TIMEOUT`이 늘 수 있음 | 차단 아님 |
| RD-7 | **Vercel API와 CLI 접근 권한** | (a) `npx vercel login` 또는 Vercel 커넥터에서 siegfriexs-projects 팀 권한 재승인 (b) 현 상태 유지 | (a) | 이번 실행에서는 env 조회, 배포 로그, WAF 설정, 보호된 Preview 확인을 할 수 없었음(403) | 배포 검증을 GitHub 상태와 공개 URL로만 해야 함 | 차단 아님 (RD-1 수행에 필요) |
| RD-8 | **Gemini 키 교체** | (a) 교체 (b) 유지 | 사용량을 확인한 뒤 판단 | 2026-10-18 13:52~14:17 KST 동안 구 운영 배포가 레이트 리밋 없이 유료 추론을 열어 두었음. 남용 여부는 Google 사용량 대시보드로만 확인 가능 | — | 차단 아님 |
| RD-9 | **Vercel 무료 플랜 실행 시간** | 플랜 확인 | `maxDuration` 200s가 허용되는지 확인 | 빌드는 성공했지만, 200s 실행이 실제로 보장되는지는 계정 플랜을 확인하지 못함 | 한도가 더 낮으면 긴 요청이 플랫폼 timeout으로 끊김 | 차단 아님 |
