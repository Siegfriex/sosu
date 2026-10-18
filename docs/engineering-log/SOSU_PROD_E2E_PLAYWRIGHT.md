# SOSU — 운영 E2E (Playwright, 2026-10-18 16:22~16:28 KST)

- 대상: 프론트 `https://sosu-rosy.vercel.app`(build `d8dc805`), API `https://sosu-py.vercel.app`(build `d345e0d9c67a`)
- 도구: `@playwright/test` 1.60.0, Chromium 148, 워커 1, 재시도 0. 유료 테스트를 재시도하면 과금 호출이 한 번 더 생기므로 재시도는 끈다.
- 스위트: `web/e2e/`(`npm run e2e:prod`)

## 결과

| 구간 | 결과 | AI POST가 실제로 나간 수 |
|---|---|---|
| 무료(14) | **14/14 통과**. 첫 실행에서 4건이 실패했는데 모두 테스트 쪽 가정 오류였다(아래 참고). 수정 뒤 두 번 연속 통과했고, 레포에 편입한 뒤 한 번 더 통과했다 | 0 |
| 유료(2) | **2/2 성공** (200, 화면 렌더 확인) | 2 |
| WAF(1) | **통과**: 422 ×3 → 엣지 429 → 화면 "요청이 많아요" | 4 (모두 빈 입력) |

### 무료 14건
- **API 상태**
  - features: inference=true, email·image_storage·research=false, knowledge=gb2-5edea367이고, `X-SOSU-Build`가 `build`와 같다.
  - CORS 사전 요청(진단·처방)에서 허용 origin이 운영 프론트와 같다.
  - 번들은 운영 API를 가리킨다. localhost, mock 마커, `AIza…`는 없다.
- **화면**
  - 11개 라우트를 320, 390, 1440 너비에서 열었다. 3개 너비 모두 가로 overflow 0, console error 0이다.
  - 결과 화면에 직접 들어가면 리포트 대신 입력 단계로 돌아간다.
- **입력**
  - 설문 3단계 → 업로드 이동을 확인했다.
  - Q6은 3개까지만 고를 수 있고, 4번째 칩은 disabled다. Q18은 하나만 선택된다.
  - 새로고침하거나 뒤로 가도 답변이 유지된다.
  - 업로드 accept 목록에 pdf가 없다.
- **처방 입력**: 스크린샷 2장이면 버튼이 막힌다. `/p/` URL도 막힌다. 스크린샷 3장과 reel URL이 있으면 활성화된다(제출은 하지 않음).
- **오류 화면 stub** (브라우저 안에서 응답을 대신 채움, 네트워크로 나가지 않음)
  - 503 → "준비 중"이 뜨고 재시도 버튼이 없다. 돌아가도 답변이 남아 있다.
  - 502 → 다시 시도 → fixture 결과의 섹션 9개가 렌더된다.
  - 504 → timeout 문구가 뜬다.
  - **CORS 헤더 없는 평문 429**(Vercel 엣지와 같은 형태) → "요청이 많아요"가 뜬다.
  - 처방 503 → "준비 중"이 뜬다.
- 무료 구간에서 네트워크로 나간 AI POST는 0건이다(원장으로 확인).

첫 실행 실패 4건은 모두 테스트 쪽 가정이 틀린 경우였다.
- 4번째 칩은 클릭이 안 되는 게 정상이다. 앱이 disabled로 최대 선택 수를 지키고 있었다.
- 알 수 없는 경로는 `/survey`를 거쳐 *현재 진행 단계*로 복귀한다. 의도된 동작이다.

### 유료 2건

| | 진단 (제품 이미지 + Q18=아니요) | 처방 (인사이트 3장) |
|---|---|---|
| request_id (= 보낸 X-Request-ID) | `web-367c69a8-…` | `web-f606d40f-…` |
| 소요 | 40.9 s | 28.0 s |
| provider 호출 (Vercel 로그) | visual-observation-v1 → diagnosis-v2 → **REPAIRABLE(오류 2건) → repair-v1 → PASS**, 총 3회, 토큰 15,246 | insight-observation-v2 → prescription-v3 → PASS, 총 2회, 토큰 13,280 |
| 지식 주입 | gb2-5edea367, 규칙 26개 | 규칙 24개 |
| 렌더 | 섹션 9개, 핵심 필드 렌더 확인, 320/1440 overflow 0 | 요약과 next_actions 4개 렌더 확인, 320 overflow 0 |
| 검사 | **Q18 위반 0**: 백엔드 `find_violations`를 응답 문자열 48개에 그대로 적용. "얼굴과 목소리 없이도…"처럼 부정 표현으로 쓰인 것만 있다 | URL slug(`E2EPWTEST01`) 유출 0. 지표(조회 815,928 등)는 스크린샷 값과 일치한다 |
| 이메일 | 발송 화면에서 "준비 중"이 뜨고, `/delivered`로 직접 가도 성공 화면이 나오지 않는다 | 발송 화면에서 "준비 중" |

- 이미지 반영의 근거: positioning.rationale에 "현재 관측된 이미지는 2D 그래픽 형태"라는 문장이 있다. 테스트용 이미지는 합성 그림이라 실제로 2D 그래픽이다.
- 품질 메모
  - 처방 action 2의 제목은 "3초 이하"인데 본문은 "5초를 넘지 않게"라서 서로 다르다.
  - 진단의 priorities 섹션과 finalGuidance 섹션 제목이 같다("릴스에서 가장 먼저 보여줘야 할 것"). 코드에 OPEN L5로 이미 기록돼 있다(원본 디자인에서 중복).

### WAF
- 65초 동안 기다려 새 카운트 창이 열린 뒤 빈 진단을 제출했다.
- 1~3번째 요청은 422 `INSUFFICIENT_INPUT`였다. Gemini는 호출되지 않았다.
- 4번째 요청은 `net::ERR_FAILED`였다(엣지 429, CORS 없음). 화면에는 `data-error-kind=rate-limited`, "요청이 많아요", 다시 시도 버튼이 떴다.

## 테스트 외 요청 (같은 시간대)
Vercel 로그에는 이 스위트의 원장에 없는 유료 요청 3건이 있다.
- 07:19 UTC 진단(이미지 있음)
- 07:22 UTC 처방
- 07:25:52 UTC 진단(이미지 있음)

이 스위트에서 나간 요청이 아니라고 보는 근거는 두 가지다.
- 원장에 기록된 요청은 진단 1건, 처방 1건뿐이다.
- 첨부 파일은 메모리에만 있어서, 페이지를 다시 불러온 뒤에는 이미지가 포함된 요청을 보낼 수 없다.

따라서 외부 사용으로 판단한다(오너의 직접 사용으로 추정). 모두 200 PASS였다.

## 비용
- 이 스위트가 보낸 요청은 2건이고, provider 호출은 5회다(로그 확인).
- WAF 구간은 빈 입력만 보냈으므로 provider 호출이 0회다.

## 재현
```bash
cd web
npm run e2e:prod                    # 무료
SOSU_E2E_PAID=1 npm run e2e:prod    # +유료 2건 (과금)
SOSU_E2E_WAF=1 npm run e2e:prod     # +WAF (유료 직후라면 60초 이상 지난 뒤 실행)
```
증거는 `web/scripts/shots/playwright-prod/`(gitignored)에 남는다: report.json, html, ledger.json, live_*.json, 스크린샷.
