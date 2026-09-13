# SOSU — HANDOFF (2026-09-13)

> 대상: 이 레포를 이어받는 로컬 에이전트. 이 문서 하나로 "무엇이 어디까지 됐고, 무엇을 건드리면 안 되고, 다음에 무엇을 해야 하는지"가 파악되어야 한다.
> Design SSOT는 Figma `ejRfXQERdNsBWbKYEdemRB`의 `00_Foundations` ~ `06_Handoff` 페이지. 코드 SSOT는 `web/`.

---

## 0. 제품 한 줄

**SOSU** — 소규모 수공예 브랜드를 위한 릴스 컨설팅.
- **문진표(MAIN)**: 20문항 설문(3스텝) → 제품 이미지 업로드(선택) → AI 진단 → 릴스 진단서 → 이메일로 PDF 발송
- **처방전(PRESCRIPTION)**: 인스타 릴스 URL + 인사이트 캡처 3장(필수) → AI 처방 → 릴스 처방전 → 이메일로 PDF 발송
- 두 워크플로우는 상단 고정 탭(문진표 / 처방전)으로 오가며 **draft가 서로 독립**, "첫 화면으로 돌아가기"만 해당 워크플로우를 초기화.

## 1. 레포 구조

```
sosu/
├─ web/            ← 프론트 (Vite + React 19 + TS + react-router). 이번 세션 산출물. 미커밋(untracked).
├─ SOSU_py/        ← 백엔드 git submodule (https://github.com/Siegfriex/SOSU_py). 내용은 이번 세션에서 건드리지 않음.
├─ SSOT/           ← 오너가 추가한 디렉토리(untracked). 이번 세션 산출물 아님 — 내용 확인 후 취급 결정.
├─ HANDOFF.md      ← 이 문서
└─ LICENSE, README.md
```

실행 / 검증:
```bash
cd web && npm install && npm run dev      # http://localhost:5173
npm run typecheck                          # tsc -b (0 error)
npm run tokens:check                       # tokens.css == 생성기 출력인지 검증 (재생성: npm run tokens)
npm run e2e                                # 빌드 → :5199 preview → Chrome 자동 주행 44 check (BASE_URL=… 로 기존 서버 재사용)
npm run test:media                         # src/media/* 브라우저 테스트 6 check (:5199 dev)
npm run verify                             # 위 4개 순차 실행 = FRONTEND_BASELINE 게이트
```
테스트 스크립트는 자체 서버를 :5199에 띄운다. 다른 사람이 띄운 :5173은 절대 건드리지 않는다.

## 2. 현재 상태 요약

| 영역 | 상태 |
|---|---|
| Figma canonical 재구축 | **완료.** 7 페이지, Variables 91, Text Style 10, 컴포넌트 27 set, 화면 15 + Lightbox overlay(전부 Auto Layout·HUG, 화면은 COMPONENT), 반응형 스펙시먼 13, 상태 스펙시먼 7, 프로토타입 47 reaction, Handoff 문서 A~M, MCP 라운드트립 8/8 통과 |
| Figma 폰트 | **DEFERRED.** 원격 MCP 런타임에 SUITE가 없어 Text Style 10개가 Noto Sans KR. Figma Desktop에서 스타일 10개 family만 SUITE로 바꾸면 전체 전환 (`06_Handoff K`) |
| 프론트 (`web/`) | **FROZEN (2026-09-13).** 목데이터로 15개 상태 전부 동작. SUITE Variable 셀프 호스팅(CDN 요청 0). `npm run verify` = typecheck · tokens:check · e2e 44 · media 6 전부 통과. 접근성 마감, 범주형 답변 코드화, API 경계(`api/client.ts`) 정리 완료 |
| 백엔드 연동 | **미착수.** `web/src/api/mock.ts`가 인터페이스 역할 |
| 배포 | Vercel, Root Directory `web`, **Frontend Mock MVP v1** (AI 백엔드 미연동, runtime provider = mock) |

## 3. 디자인 계약 (Figma → 코드)

### 3.1 페이지 / 노드 ID
| page | id | 용도 |
|---|---|---|
| `legacy` 0:1 / `drectory` 1:1065 | — | **읽기 전용 증거. 절대 수정·삭제 금지.** |
| 00_Foundations | 11:186 | 토큰 테이블, 타이포 스펙시먼, 반응형 규칙 |
| 01_Components | 11:187 | 27 component set |
| 02_Main_Flow | 11:188 | SURVEY_* 화면 컴포넌트 39:3254–3262 |
| 03_Prescription_Flow | 11:189 | PRESCRIPTION_* 39:3263–3269, OVERLAY_Lightbox 39:3264 |
| 04_States_Responsive | 11:190 | 320/360/390/430 + 1440, 상태 스펙시먼 |
| 05_Flows | 11:191 | 프로토타입 인스턴스 + flowStartingPoints |
| 06_Handoff | 11:192 | A 매핑 · B 상태머신 · C 컴포넌트→React · D 토큰 · E AI 필드 · F 인터랙션 · G 반응형 · H 리셋 · I 모달 · J 정규화 기록 · K 폰트 · L OPEN · M 질문 모델 |

핵심 컴포넌트: AppHeader 25:635 · TopTabs 15:242 · TopTab 13:261 · SurveyProgress 13:236 · PrimaryButton 17:350 · SecondaryButton 17:369 · TextField 18:339 · TextArea 18:365 · EmailField 27:419 · URLField 18:392 · ChoiceChip 18:415 · ChoiceGroup 19:390 · QuestionBlock 19:431 · FileUploader 27:513 · UploadedFileItem 27:441 · StagedProgress 28:471 · LoadingState 28:516 · ErrorState 28:557 · ReportCard 30:474 · ReportSection 30:488 · ReportBrandTable 30:489 · EmailDeliveryForm 31:551 · DeliverySuccess 31:474 · ExampleThumbnail 26:439 · Lightbox 31:552 · Logo 13:192

### 3.2 토큰
- `web/src/styles/tokens.css` = Figma Variables 1:1 (`--prim-*`, `--color-*`, `--space-*`, `--size-*`, `--radius-*`, `--z-*`, `--opacity-*`, `--stroke-*`). **Figma 변수를 바꾸면 이 파일을 다시 생성**(스크래치 `gen_tokens.py` 방식: `use_figma`로 변수 export → CSS).
- 텍스트 스타일 10개 = `global.css`의 `.t-*` 클래스 (Display/ResultTitle 24·1.5, Heading/Section 19·1.5, Label/Strong 12, Body/Primary 13, Body/Secondary 12, Helper 10, Micro 9, Action/Primary 15 Bold, Action/Secondary 13, Action/Tab 14 — 본문 계열 line-height 1.6).
- 폰트: `--font-family-brand: 'SUITE', 'Noto Sans KR', system-ui, sans-serif` — SUITE Variable(300–900)은 `web/public/fonts/`에 셀프 호스팅(`global.css` @font-face, `index.html` preload). 외부 폰트 CDN 링크 없음(Noto Sans KR은 로컬 설치 폴백으로만 스택에 존재). e2e가 CDN 요청 0건을 검증.
- 토큰 생성기: `web/scripts/gen_tokens.py`의 `raw` 테이블이 source. `npm run tokens`로 재생성, `npm run tokens:check`로 검증. **tokens.css를 손으로 고치지 말 것.**
- 두 테마 셸: light page(`#fafbfc` + dark card `#172228`) = 입력 화면 / dark page = 로딩·결과·전송. `.app[data-theme]` + `.header[data-theme]`.

### 3.3 컴포넌트 매핑 (Figma set → 코드)
`web/src/components/shell.tsx` (AppHeader, TopTabs, SurveyProgress, Logo, Screen, ContentCard, SectionHeader, Divider) ·
`controls.tsx` (Button, TextField/TextArea/EmailField/URLField, ChoiceChip, ChoiceGroup, QuestionBlock, InlineMessage) ·
`blocks.tsx` (FileUploader, UploadedFileItem, StagedProgress, LoadingState, ErrorState, ReportSection, ReportBrandTable, EmailDeliveryForm, DeliverySuccess, ExampleThumbnail, Lightbox).
prop 이름은 Figma variant property와 동일하게 유지할 것 (state/size/selection/layout/emphasis/workflow/kind).

### 3.3b 인트로 블록 (SURVEY_STEP_1) — 원본 1:1197 기준
Figma 캐노니컬 33:255는 텍스트와 아트를 flex 한 줄에 넣어 텍스트가 어절 중간에서 꺾이고 아트가 축소·중앙 정렬되는 오류가 있음(컴포넌트화 과정 산물). 코드는 **legacy 1:1197**을 따른다: 텍스트 13px/1.6, 줄바꿈 고정(`pre-line`, 자연 폭 ≤ 240px), "소수"만 Bold, 고양이 아트 162×162를 카드 우상단에 절대 배치(텍스트 상단 −78px, 콘텐츠 우측 −9px, 320 이하 140px), "안녕~"은 말풍선 중심(30.5%/39.5%)에 아트 폭 18%로 오버레이. Figma 33:255는 오너가 원본대로 수정 필요.
전역 `word-break: keep-all` + `overflow-wrap: anywhere` — 한글은 어절 단위로만 줄바꿈.

### 3.4 인터랙션 모델 (모든 pressable 공통, `global.css` "interaction model")
| 상태 | 규칙 |
|---|---|
| rest | 토큰 기본색 |
| hover | **`@media (hover: hover) and (pointer: fine)`에서만** — 터치 기기에서는 hover 자체가 없음(탭 후 색이 남는 sticky hover 방지). 선택된 칩·disabled에는 hover 없음 |
| pressed (`:active`) | 누르는 순간 **즉시**(`--press-in: 0ms`) pressed 색 + `scale(.985)` — 손가락/마우스를 떼기 전까지만 |
| release | `--press-out: 180ms`, `cubic-bezier(.2,.8,.3,1)`로 rest(또는 데스크톱 hover)로 복귀 |
| focus | 키보드에서만 `:focus-visible` 링 |
| disabled / loading | hover·press 없음, `cursor: not-allowed` |
| reduced motion | scale·transition 제거 |
적용 대상: Button(primary/secondary) · ChoiceChip · TopTab(비선택 탭만) · file remove · ExampleThumbnail · dropzone · Lightbox close. `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`.

## 4. 상태 머신 · 라우트 · 리셋

```
SURVEY:        STEP_1 → STEP_2 → STEP_3 → UPLOAD → GENERATING → RESULT → DELIVERY → DELIVERED     (+ ERROR)
PRESCRIPTION:  INPUT → GENERATING → RESULT → DELIVERY → DELIVERED                                    (+ ERROR)
```
- 라우트 = `web/src/state/workflows.tsx`의 `surveyRoute` / `prescriptionRoute`. `/survey`는 현재 status로 리다이렉트.
- 각 화면의 `useSyncStatus()`가 URL → status 동기화(status가 SSOT). `Screen`이 `.app[data-path]`에 커밋된 경로를 기록(테스트 훅 — 라우터 내비게이션은 React transition이라 URL이 화면보다 먼저 바뀜).
- 로딩 4단계(입력 확인/이미지 분석/진단 생성/결과 정리)는 `LoadingState`의 타이머 시퀀스(700ms 간격, 4에서 유지). **백엔드 progress 프로토콜이 아님.** API 시그니처에 stage 콜백 없음.
- 탭 클릭 → 그 워크플로우의 **현재** status 라우트로 이동. GENERATING 중 탭 locked.
- 영속: memory + `sessionStorage` (`sosu.survey.v2`, `sosu.prescription.v2` — v2부터 선택형 답변을 코드로 저장). 파일 바이너리는 메모리 레지스트리(`fileStore`)만 → 새로고침 시 파일 목록은 비워짐. GENERATING 중 새로고침 → UPLOAD/INPUT로 복귀.
- **리셋**: `첫 화면으로 돌아가기` = 해당 워크플로우만 초기화, 확인 다이얼로그 없음. 성공 후 자동 리셋 없음.
- 에러 재시도: draft 유지한 채 GENERATING 재진입.

## 5. 질문 모델 (`web/src/data/questions.ts`)
- 20문항(실제 19개, **Q19는 원본에 없음**, 번호 18→20 유지) / 3섹션: 브랜드 기본 정보(1~7) · 고객과 브랜드 이미지(8~13) · 릴스의 방향성(14~20). SurveyProgress step 1/2/3 = 섹션, 4 = 업로드.
- 적용된 정규화(원본 결함): Q8 helper(Q2 복붙) 제거 · Q9 "선물하려고" 중복 제거 · Q12 "*최대 3개 선택" 제거(컨트롤이 텍스트) · Q7 줄바꿈/공백 정리.
- 선택형: Q6·Q10·Q11·Q16·Q17 multiple max 3 / Q9 multiple(max 미정) / Q18 single(추정). `required`는 전부 미정(false).
- **답변 저장 형식**: text 문항 = 사용자 원문 그대로(요약·변환 없음). choice 문항 = `ChoiceOption.code` 배열(예: Q9 `aesthetic`, Q18 `face_only`). 코드는 `questions.ts`에 정의 — `contracts/01_DOMAIN_CONTRACT.md`가 나오면 그 코드 집합과 대조해 맞출 것(현재 코드는 프론트 제안값).

## 6. 백엔드 연동 경계

**Contract authority는 monorepo 루트 `contracts/`(01_DOMAIN_CONTRACT.md · 02_openapi.json · 03_CONTRACT_FIXTURES.json)** — Python 에이전트가 작성. 프론트는 read-only consumer이며 `mock.ts`는 authority가 아니다. 아직 없으면 프론트가 임의 작성하지 않는다.

`web/src/api/`:
- `client.ts` — 화면이 import하는 유일한 진입점. `SosuApi` 인터페이스 + `api = mock`. 실제 클라이언트로 교체 시 이 파일만 바꾼다. `02_openapi.json`이 준비되면 생성된 TS 타입으로 교체(수동 복제 금지).
- `errors.ts` — `ApiError(kind: 'timeout' | 'error' | 'send-error')`. 화면은 kind로만 분기.
- `validation.ts` — 이메일 / 인스타 URL 규칙(URL 규칙은 OPEN §8-4).
- `mock.ts` — 목 transport. 디버그 knob: generating 라우트의 `?fail=timeout|error`, `?fixture=long`.

```ts
generateDiagnosis(answers: Answers, { signal }) → Promise<SurveyReport>
generatePrescription(url: string, { signal })   → Promise<PrescriptionReport>
sendReportEmail(email: string)                  → Promise<void>   // 실패 시 ApiError('send-error')
```
- 실제 Python API는 **한 번의 동기 요청**으로 연결된다고 가정. SSE/WebSocket/stage 이벤트 없음. 로딩 4단계는 프론트 프레젠테이션(§4).
- 미디어 준비 경계 `web/src/media/`: `prepareProductImage`(진단, 0..1장, 출력 ≤ 1.25 MB) · `prepareInsightImage(s)`(처방, 정확히 3장, 각 ≤ 900 KB · 합 ≤ 2.7 MB). canvas 압축은 `compressImage.ts`에 격리, 반환은 `File`. **아직 업로드 흐름에 연결되지 않음**(실제 클라이언트 연결 시 전송 직전에 호출). 입력 파일 상한은 OPEN L8(오너 결정) — 유틸은 출력 예산만 보장.
- `SurveyReport` / `PrescriptionReport` = **ReportViewModel**(UI 모델). Gemini 출력 JSON과 다를 수 있으므로 **adapter 계층**에서 변환(리스트 → 줄 텍스트 등). 필드 목록은 `data/report.ts` + Figma `06_Handoff E`.
- 파일: 현재 프론트는 `File` 객체를 메모리에만 보관. 실제 연동 시 multipart 업로드 또는 presigned URL — 미정.
- 권장 HTTP 형태(제안): `POST /api/diagnosis` → `{jobId}` · `GET /api/jobs/:id` → `{status, stage, result?, error?}` (폴링 또는 SSE) · `POST /api/delivery` `{jobId, email}` → 202. 백엔드(`SOSU_py`) 쪽 실제 구조에 맞춰 조정.

## 7. 검증된 것 (증거) — `npm run verify`
- `npm run typecheck` 0 error · `npm run build` OK · `npm run tokens:check` up to date.
- `npm run e2e` (`web/scripts/e2e.mjs`, 프로덕션 빌드 + 시스템 Chrome) 44 check: FONT(로컬 woff2 200 · 400/600/700 check · body family SUITE · CDN 요청 0 · Noto 미로드) · MAIN 1→2→3→UPLOAD(칩 aria-pressed/max/코드 저장/키보드 Space·Enter, Q18 single) · 탭 왕복 시 draft 유지 · PRESCRIPTION(URL·이미지 3장·Lightbox dialog/focus/trap/ESC/backdrop/focus restore) · GENERATING(탭 잠금·live status·% 없음)→RESULT→DELIVERY(invalid email aria-invalid+alert)→DELIVERED→리셋(상대 워크플로우 보존, 양방향) · ERROR 4종(role=alert) + 재시도 · 장문 픽스처 320/430/1440 오버플로·클리핑 없음 · 320/360/390/430/1440 렌더.
- `npm run test:media` 6 check: 예산 이하 원본 반환 · 34.5 MB PNG → ≤1.25 MB JPEG(2048 edge) · 인사이트 3장 각 ≤900 KB 합 ≤2.7 MB · 개수/비이미지/디코드 실패 거부.
- 스크린샷: `web/scripts/shots/`(gitignored).
- Figma ↔ canonical 스크린샷 대조 7쌍: 정체성·계층·리듬 유지.

## 8. 남은 일 (우선순위 순)

### P0 — 제품이 되기 위해 필수
1. **백엔드 연동** (`SOSU_py`): Gemini 진단/처방 API, stage 이벤트, ReportViewModel adapter, 파일 업로드 경로. `mock.ts`를 실제 클라이언트로 교체(같은 시그니처 유지하면 화면 무수정).
2. **PDF 생성 + 이메일 발송** 서버 측. 프론트는 이메일만 POST.
3. **OPEN 콘텐츠 결정 9건** — 오너 답 필요 (Figma `06_Handoff L` / 코드 주석 `OPEN L1~L6`):
   L1 Q19 부재 · L2 Q12 컨트롤 · L3 Q10=Q11 옵션 동일 · L4 Q9/Q18 선택 모드·max · L5 결과지 마지막 섹션 제목 중복 · L6 "포지셔닝 근거" 섹션 포함 여부 · L7 required 문항 · L8 문진표 업로드 상한(개수/용량) · L9 DRAFT 카피 전부(에러·타임아웃·성공·유효성 문구)
4. **URL 검증 규칙 확정**(현재 `instagram.com` 호스트만) · 클라이언트 타임아웃 값 · 이미지 파일 상한.
5. `contracts/` 도착 후: `questions.ts`의 choice 코드 집합 대조 · `02_openapi.json` → TS 타입 생성 · `client.ts`의 `api`를 실제 클라이언트로 교체 · `media/prepare*`를 전송 직전에 연결.

### P1 — 품질 (2026-09-13 완료분은 취소선)
- ~~e2e 스크립트를 레포에 정착 + `npm run e2e`~~ → `npm run verify`.
- ~~접근성 마감~~ → 칩은 **aria-pressed 토글 버튼**(디렉티브; radio/checkbox+방향키 대신), 그룹이 선택 모드/최대치 안내, 탭 roving tabindex, Lightbox trap/restore, 에러 role=alert, 로딩 role=status. 잔여: 스크린리더 실기기 검수 없음.
- ~~장문 텍스트 레이아웃 QA~~ → `?fixture=long`. 관찰: 320에서 브랜드 요약 2열 셀이 좁아 한글이 글자 단위로 줄바꿈됨(오버플로 아님; `word-break: keep-all` 도입 여부는 디자인 결정).
- ~~favicon / OG / title~~ → `index.html` 기본 메타 + 워크플로우별 `document.title`. OG 이미지 없음(에셋 미정).
8. `SurveyProgress` 점 클릭으로 이전 스텝 이동 허용 여부(OPEN M5) → 허용 시 구현.

### P2 — 디자인 시스템 유지
10. Figma Desktop에서 Text Style 10개 → SUITE 스왑(오너 작업, `06_Handoff K`), 스왑 후 02/03 화면 시각 QA.
11. Figma Code Connect 매핑(`add_code_connect_map`)으로 27 set ↔ `web/src/components/*` 연결.
12. ~~토큰 재생성 파이프라인 고정~~ → `npm run tokens` / `tokens:check`.

### 하지 말 것
- Figma `legacy` / `drectory` 페이지 수정·삭제.
- 도메인 작업. (배포: 2026-09-13 오너 지시로 `web/`을 Vercel에 Mock MVP로 배포 — Root Directory `web`, Vite 자동 감지, `web/vercel.json` SPA rewrite. 배포 URL은 문서에 기록하지 않음.)
- 가짜 퍼센트 로딩, 성공 후 자동 리셋, 리셋 확인 다이얼로그, 탭 아이콘 — 전부 디렉티브로 금지된 패턴.
- `SOSU_py` 서브모듈·`SSOT/` 내용 무단 변경.

## 9. 알아둘 함정
- **`gen_tokens.py`는 2026-09-13까지 시맨틱 토큰을 `var()` 없이 출력하는 버그가 있었고**, 그 상태로 재생성하면 화면 색이 전부 사라진다(수정됨, `tokens:check`가 잡음). 생성기 바꾸면 반드시 e2e 스크린샷으로 색 확인.
- **라우터 내비게이션은 React transition**: URL이 먼저 바뀌고 화면은 뒤에 커밋된다. 테스트는 `location.pathname`이 아니라 `.app[data-path]`를 기다릴 것.
- **테스트 서버 정리**: 하네스가 exit/uncaught 시 :5199를 내리지만, 강제 kill 되면 `pkill -f "vite preview --port 5199"`. `pkill -f`는 자기 셸까지 죽일 수 있으니 패턴을 좁힐 것.
- **React StrictMode**: generating 화면의 요청 effect는 `[]` deps + ref 패턴(이중 마운트에서 abort→재시작). `patchSurvey` 등은 매 렌더 새 함수이므로 effect deps에 넣지 말 것.
- **Figma 원격 MCP**: 응답 ~20KB 초과 + 한글이면 파싱 실패(`get_metadata` 사실상 불능) → `use_figma` 읽기 스크립트에서 문자열은 `encodeURIComponent`, 출력은 작게. 플러그인 코드는 서버 실행이라 로컬 폰트 불가. `resize()`가 `primaryAxisSizingMode`를 FIXED로 리셋, opacity 변수는 %, paint 객체에 `opacity`를 얹으면 변수 바인딩 시 무시됨(노드 opacity 사용).
- 고양이 PNG는 Figma `download_assets`의 `rawImages`(투명 원본)를 써야 함. `export`는 배경이 깔림.
- `web/src/assets/folder.svg`는 legacy 브러시 벡터(94KB) 대신 단순 아웃라인으로 대체한 것.

## 10. 세션 산출물 위치
- Figma 파일 내 7 페이지(위 ID).
- `web/` 전체(미커밋 — 커밋 후보 목록은 FREEZE REPORT 참조). `web/README.md` 참고.
- QA 스크립트: `web/scripts/e2e.mjs` · `media-test.mjs` · `lib/harness.mjs` · `gen_tokens.py`. 스크린샷은 `web/scripts/shots/`(gitignored, 실행 시 재생성).
