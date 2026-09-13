# SOSU — 현황 (2026-09-13)

> 한 줄: **프론트는 동결(FROZEN) 완료, 백엔드 계약은 `SOSU_py/contracts/`에 v1.0으로 존재(미커밋), 둘 사이 정합 작업이 다음 단계.**
> 상세 이력·규칙은 `HANDOFF.md`, 동결 보고서는 세션 기록(FREEZE REPORT) 참조.

---

## 1. 레포 / git

| 항목 | 상태 |
|---|---|
| 루트 `main` | `3915408` 위에 프론트 baseline 커밋("Freeze frontend MVP baseline for Vercel") 예정/완료. `contracts/`(루트, 다른 에이전트)·`SSOT/`·`SOSU_py` 워크트리는 프론트 커밋 범위 밖 |
| `web/` | 46개 파일 untracked — 동결 baseline, 커밋 후보 (아래 §6) |
| `HANDOFF.md`, `STATUS.md` | untracked, 프론트 세션 문서 |
| `SSOT/` | 오너가 추가한 SSOT 문서(md/pdf). untracked, 취급 미결 → 커밋 대상에서 제외 중 |
| `SOSU_py/` (서브모듈) | gitlink `5927c1b` 유지. 워크트리에 다른 에이전트의 미커밋 작업 11건(`app/ contracts/ docs/ tests/ pyproject.toml uv.lock` 등). **프론트 세션은 건드리지 않음** |

배포: Vercel(Root Directory `web`, Vite 자동 감지, `vercel.json` SPA rewrite) — **Frontend Mock MVP v1**, AI 백엔드 미연동. URL은 릴리스 보고에만 기록.

---

## 2. 프론트 (`web/`) — FROZEN

Vite 8 + React 19 + TS + react-router 7. Figma `ejRfXQERdNsBWbKYEdemRB` `00_Foundations`~`06_Handoff`가 디자인 SSOT.

**되어 있는 것**
- 15개 화면 상태 전부 목데이터로 동작 (문진표 3스텝 → 업로드 → 생성 → 결과 → 전송 → 완료, 처방전 입력 → 생성 → 결과 → 전송 → 완료, 각 ERROR)
- SUITE Variable 셀프 호스팅 (`public/fonts/`), 외부 폰트 CDN 요청 0
- 접근성 마감: 칩 `aria-pressed` 토글, 그룹 선택모드/최대치 안내, 탭 roving tabindex, 필드 labelledby/describedby/aria-invalid, 업로더 단일 탭스톱, Lightbox dialog/trap/restore/scroll-lock, 에러 `role=alert`, 로딩 `role=status`
- 선택형 답변(Q6/9/10/11/16/17/18)을 **코드**로 저장(`sosu.*.v2`), 텍스트 답변은 원문 그대로
- API 경계 `src/api/client.ts`(화면의 유일한 진입점, 현재 `api = mock`) · `errors.ts` · `validation.ts` · `mock.ts`(`?fail=`, `?fixture=long`)
- 미디어 예산 유틸 `src/media/` (진단 이미지 ≤ 1.25 MB, 인사이트 3장 각 ≤ 900 KB) — UI 미연결
- 로딩 4단계는 프론트 타이머 시퀀스(백엔드 progress 아님)
- 라우트 메타(title/description/OG/favicon), 워크플로우별 `document.title`
- 토큰 파이프라인 `npm run tokens` / `tokens:check` (생성기 `var()` 누락 버그 수리됨 — 이전엔 테마 색이 전부 빠져 렌더되고 있었음)

**검증 명령 (전부 통과, 2026-09-13)**
```bash
cd web
npm run verify        # = typecheck + tokens:check + e2e(44) + test:media(6)
npm run build         # OK
npm run lint          # 15 warning, 전부 동결 이전 코드에서 유래
```

**프론트 잔여 (계약 무관)**
- `SurveyProgress` 점 클릭으로 이전 스텝 이동 허용 여부 (OPEN M5)
- 320px 브랜드 요약 2열 셀 한글 글자 단위 줄바꿈 → `word-break: keep-all` 도입 여부 (디자인 결정)
- 제출 버튼 `aria-disabled`이지만 `type=submit`이라 활성화 가능 (구조 변경 보류)
- 스크린리더 실기기 검수 없음
- Figma 쪽: Text Style 10개 SUITE 스왑(오너 데스크톱 작업), Code Connect 매핑

---

## 3. 백엔드 (`SOSU_py`) — 읽기 전용 관찰

프론트 세션이 `SOSU_py/contracts/`를 **읽기만** 한 결과. 수정·해석·복제하지 않음.

- 위치: **`SOSU_py/contracts/`**. 루트 `contracts/`도 이후 생성됨(다른 에이전트, 미커밋) — 어느 경로가 authority인지 확정 필요. 프론트는 둘 다 읽기만 함
- 내용: `README.md`(Frontend Contract v1.0) · `openapi.json`(34 KB, FastAPI export) · `fixtures/*.json` 17개(요청/성공/에러 13종/`ui_option_catalog.json`)
- 엔드포인트: `GET /api/v1/health` · `POST /api/v1/diagnosis` · `POST /api/v1/prescription`
- Base URL(dev) `http://127.0.0.1:8000`, **CORS는 `localhost:5173`만 허용** (프론트 검증 포트 5199는 막힘)
- 응답은 envelope `{ok, request_id, contract_version, data}`; 에러 fixture에 `image_too_large`, `invalid_image_count`, `invalid_image_type`, `invalid_instagram_url`, `model_timeout` 등 13종

---

## 4. 프론트 ↔ 계약 정합성 갭 (다음 작업의 핵심)

프론트는 계약이 없는 상태에서 코드를 **제안값**으로 넣었고, 이제 `ui_option_catalog.json`과 대조 가능해졌다. 아래는 관찰된 차이. **결정 전까지 프론트는 변경하지 않음.**

### 4.1 선택지 코드 (프론트 `questions.ts` vs `ui_option_catalog.json`)

| 문항 | 프론트 | 계약 v1.0 |
|---|---|---|
| Q6 희소성 | `scarcity` | `rarity` |
| Q9 특별해서 | `special` | `specialness` |
| Q9 추억을 간직하려고 | `memory` | `memories` |
| Q9 공간을 꾸미려고 | `decor` | `space_decor` |
| Q9 나만의 것을 갖고 싶어서 | `unique_ownership` | `self_expression` |
| Q10/Q11 감동 | `touching` | `moved` |
| Q16 조회수가 안 나와요 | `low_views` | `low_reach` |
| Q16 팔로워가 안 늘어요 | `low_followers` | `low_follower_growth` |
| Q16 콘텐츠를 모르겠어요 | `content_ideas` | `ideation` |
| Q16 촬영 / 편집 / 꾸준히 | `filming` / `editing` / `consistency` | `shooting_difficulty` / `editing_difficulty` / `consistency_difficulty` |
| Q17 제작 과정 위주 | `making_process` | `process` |
| 일치 | Q6 나머지, Q9 `aesthetic`/`self_reward`/`gift`, Q10/11 나머지, Q16 `low_conversion`/`other`, Q17 나머지, Q18 전부 | |

→ 계약이 authority이므로 프론트 코드를 계약 쪽으로 맞추는 것이 자연스러움 (한 파일 `questions.ts` 수정 + e2e 기대값 갱신).

### 4.2 필드/형식
- 답변 키: 프론트 `q01…q20` vs 계약 `q1_brand_name … q20_must_show` (필드명 매핑 필요 — adapter 계층)
- Q18: 프론트 `string[]`(single도 배열) vs 계약 `string` (`"face_only"`)
- Q9 max: 프론트 미정(OPEN L4) vs 계약 `max_selection: 3` → **OPEN L4 해소됨**, 프론트 `maxSelection: 3` 반영 필요
- 요청 envelope: `contract_version`, `locale: "ko-KR"` 포함

### 4.3 응답 모델 → ReportViewModel adapter
계약 `data`는 구조화되어 있음: `brand.keywords: string[]`, `positioning: {summary, rationale}`, `strengths: [{title, description}]` … 프론트 `SurveyReport`는 줄 텍스트 기반(`strengths: string`, `positioning: string`). HANDOFF §6에 예정된 대로 **adapter가 `client.ts` 뒤에서 변환**해야 하며 화면/디자인은 그대로. `positioning.rationale`은 OPEN L6(섹션 노출 여부) 오너 결정 대기.

### 4.4 에러 분류
- 프론트 `ApiError.kind`: `timeout | error | send-error` (UI는 timeout/error 두 화면)
- 계약: 13종. 최소 매핑: `model_timeout → timeout`, 입력 검증류(`invalid_image_*`, `image_too_large`, `invalid_instagram_url`, `insufficient_input`) → 입력 화면 인라인 오류로 되돌릴지, ERROR 화면으로 갈지 결정 필요(현재 UI엔 "non-retryable" 상태 없음)

### 4.5 미디어
- 계약에 `image_too_large` 존재 → 서버 입력 상한이 있음. 프론트 `media/prepare*`의 출력 예산(1.25 MB / 900 KB)이 서버 상한과 일치하는지 `openapi.json`/서버 설정과 대조 필요 (OPEN L8)
- 이메일 전송 엔드포인트가 계약에 없음 → `sendReportEmail`은 계속 mock. PDF/메일은 백엔드 범위인지, 별도 단계인지 확인 필요

---

## 5. 오너 결정 대기 (변하지 않은 것)
- OPEN L1 Q19 부재 · L2 Q12 컨트롤 · L3 Q10=Q11 옵션 동일 · L5 결과지 마지막 섹션 제목 중복 · L6 포지셔닝 근거 노출 · L7 required 문항 · L8 업로드 상한 · L9 DRAFT 카피 · M5 progress 점 클릭
- **계약 authority 경로**: 루트 `contracts/` vs `SOSU_py/contracts/`
- **`SSOT/` 취급**: 커밋 포함 여부

---

## 6. 다음 단계 (제안 순서)
1. 계약 authority 경로 확정 + `SOSU_py` 쪽 커밋 (백엔드 에이전트)
2. 프론트 baseline 커밋: `git add HANDOFF.md STATUS.md web` (제외: `SOSU_py`, `SSOT/`) — 메시지 제안 `Freeze frontend baseline: self-hosted SUITE, a11y pass, coded choice answers, api/media boundaries, npm run verify`
3. `questions.ts` 코드를 계약 카탈로그로 정렬 (§4.1) + Q9 max 3 + e2e 기대값
4. `openapi.json` → TS 타입 생성, `client.ts` 뒤에 실제 클라이언트 + 요청 매퍼(§4.2) + 응답 adapter(§4.3) + 에러 매핑(§4.4). 화면 무수정
5. `media/prepare*`를 전송 직전에 연결, 예산을 서버 상한과 일치
6. CORS에 프론트 검증 포트 추가 여부(또는 e2e를 5173으로) 협의 후 통합 e2e
