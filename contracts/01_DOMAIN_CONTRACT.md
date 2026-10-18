# SOSU AI Service — Domain Contract V1.0 (frozen)

생성: `SOSU_py/scripts/release_shared_contract.py` (런타임 모델에서 생성 — 수동 편집 금지)
동반 artifact: `02_openapi.json`(FastAPI 런타임 스키마), `03_CONTRACT_FIXTURES.json`(통합 fixture)
이 세 파일이 `web/` ↔ `SOSU_py/` 사이의 **유일한** 계약이다. 프론트는 이 밖의 백엔드 내부(EvidencePack, 프롬프트, 검증기)를 알 필요가 없다 (§12).

---

## 1. Endpoint 의미

| endpoint | 의미 | 입력 | 성공 출력 |
|---|---|---|---|
| `GET /api/v1/health` | 서비스 생존 + Gemini 키 구성 여부. 봉투 없음 | — | `{"status":"ok","service":"sosu-ai","contract_version":"1.0","gemini_configured":bool}` |
| `POST /api/v1/diagnosis` | **문진표 → 릴스 진단서.** 설문 답변(+선택 제품 이미지 1장)을 받아 `DiagnosisReportV1`을 동기 반환 | `multipart/form-data`: `payload`(JSON 문자열 `SurveyDiagnosisRequestV1`), `product_image`(파일, 0..1) | `SuccessEnvelope<DiagnosisReportV1>` |
| `POST /api/v1/prescription` | **릴스 처방전.** Reel URL + Insight 스크린샷 정확히 3장을 받아 `PrescriptionReportV1`을 동기 반환 | `multipart/form-data`: `payload`(JSON 문자열 `PrescriptionRequestV1`), `insight_images`(파일 ×3) | `SuccessEnvelope<PrescriptionReportV1>` |

- 두 POST는 **동기 요청 1회**다. 진행률 이벤트(SSE/WebSocket/job polling)는 v1 계약에 없다. 프론트는 indeterminate 로딩을 쓴다.
- 실행 시간 한도: 전체 deadline **180s** (단계별 observation 45s / synthesis 90s / repair 40s). 초과 시 `MODEL_TIMEOUT`. 클라이언트 AbortSignal은 180s보다 길게 잡는다.
- 요청 헤더 `X-Request-ID`(선택, ≤64자 `[A-Za-z0-9._-]`)는 그대로 에코되고 봉투의 `request_id`가 된다. 없으면 서버가 생성한다.
- CORS 허용 origin(dev): `http://localhost:5173`.

`payload` 공통 필드: `contract_version`(반드시 `"1.0"`), `locale`(기본 `"ko-KR"`, 결과 언어).

## 2. Q1~Q18/Q20 → request field 매핑 (`payload.answers`)

| Q | request field | 입력 종류 | 의미 | 처리 |
|---|---|---|---|---|
| Q1 | `q1_brand_name` | text | 브랜드 이름 | natural text — 원문 보존 (아래 §3) |
| Q2 | `q2_product_category` | text | 제품군 | natural text — 원문 보존 (아래 §3) |
| Q3 | `q3_hero_product` | text | 가장 자신 있는 제품 | natural text — 원문 보존 (아래 §3) |
| Q4 | `q4_materials` | text | 주 소재 | natural text — 원문 보존 (아래 §3) |
| Q5 | `q5_material_reason` | text | 소재를 쓰는 이유 | natural text — 원문 보존 (아래 §3) |
| Q6 | `q6_product_appeals` | multi ≤3 | 제품의 가장 큰 매력 | categorical multi — enum code 목록, 최대 3개 |
| Q7 | `q7_differentiation` | text | 차별점 | natural text — 원문 보존 (아래 §3) |
| Q8 | `q8_target_customer` | text | 제품을 가장 좋아할 사람 | natural text — 원문 보존 (아래 §3) |
| Q9 | `q9_purchase_motives` | multi ≤3 | 구매 이유 | categorical multi — enum code 목록, 최대 3개 |
| Q10 | `q10_desired_emotions` | multi ≤3 | 고객이 느꼈으면 하는 기분 | categorical multi — enum code 목록, 최대 3개 |
| Q11 | `q11_brand_attributes` | multi ≤3 | 브랜드를 표현하는 단어 | categorical multi — enum code 목록, 최대 3개 |
| Q12 | `q12_avoidance` | text | 피하고 싶은 이미지 | natural text — 원문 보존 (아래 §3) |
| Q13 | `q13_motif` | text | 상징/모티프 | natural text — 원문 보존 (아래 §3) |
| Q14 | `q14_primary_message` | text | 가장 어필하고 싶은 것 | natural text — 원문 보존 (아래 §3) |
| Q15 | `q15_interesting_process` | text | 신기해할 제작 과정 | natural text — 원문 보존 (아래 §3) |
| Q16 | `q16_pain_points` | multi ≤3 | 인스타그램에서 어려운 점 | categorical multi — enum code 목록, 최대 3개 |
| Q17 | `q17_current_formats` | multi ≤3 | 현재 올리는 릴스 | categorical multi — enum code 목록, 최대 3개 |
| Q18 | `q18_disclosure` | single | 얼굴/목소리 공개 가능 여부 | categorical single — `CreatorDisclosure` code 1개 또는 `null` |
| Q20 | `q20_must_show` | text | 꼭 보여주고 싶은 것 | natural text — 원문 보존 (아래 §3) |

- **모든 필드는 optional**이다(부분 제출 허용). 백엔드는 필수 문항을 만들지 않는다. 단, 답변이 하나도 없고 이미지도 없으면 `INSUFFICIENT_INPUT`.
- 알 수 없는 필드는 거부된다(`INVALID_REQUEST`). 이메일·버튼·탭·스텝 같은 앱 제어값은 `answers`에 넣지 않는다.

## 3. Natural text vs categorical 처리

| 종류 | 필드 | 프론트가 보내는 값 | 백엔드 처리 |
|---|---|---|---|
| natural text | `q1_brand_name`, `q2_product_category`, `q3_hero_product`, `q4_materials`, `q5_material_reason`, `q7_differentiation`, `q8_target_customer`, `q12_avoidance`, `q13_motif`, `q14_primary_message`, `q15_interesting_process`, `q20_must_show` | 사용자가 쓴 문자열 그대로 (`null`/빈 문자열 허용, 최대 4,000자) | **의미를 바꾸지 않는다.** Unicode NFC, 앞뒤 공백 제거, CRLF→LF, 빈값→`null`, 2,000자 안전 길이만 적용. 요약·키워드 추출·번역 없음. 이 원문이 그대로 AI 근거가 된다 |
| categorical multi | `q6_product_appeals`, `q9_purchase_motives`, `q10_desired_emotions`, `q11_brand_attributes`, `q16_pain_points`, `q17_current_formats` | stable code 문자열 배열 (한글 label을 보내지 않는다) | enum 검증, 중복 제거, 최대 3개. label→code 표는 §4 / `03_CONTRACT_FIXTURES.json#ui_option_catalog` |
| categorical single | `q18_disclosure` | code 1개 또는 `null` | hard constraint로 파생 (§6) |

## 4. Stable enum registry (code ↔ 한글 UI label)

프론트는 label을 렌더하고 **code를 전송**한다. 표기는 프론트 `questions.ts`의 options 문자열과 동일하다(Q17 정식 label = `사진/영상 혼합`).

### Q6 — `q6_product_appeals` → `ProductAppeal`

| 한글 UI label | code |
|---|---|
| 디자인 | `design` |
| 색감 | `color` |
| 디테일 | `detail` |
| 질감 | `texture` |
| 소재 | `material` |
| 제작 과정 | `process` |
| 스토리 | `story` |
| 희소성 | `rarity` |
| 기타 | `other` |

### Q9 — `q9_purchase_motives` → `PurchaseMotive`

| 한글 UI label | code |
|---|---|
| 예뻐서 | `aesthetic` |
| 특별해서 | `specialness` |
| 나를 위해 | `self_reward` |
| 선물하려고 | `gift` |
| 추억을 간직하려고 | `memories` |
| 공간을 꾸미려고 | `space_decor` |
| 나만의 것을 갖고 싶어서 | `self_expression` |

### Q10 — `q10_desired_emotions` → `DesiredEmotion`

| 한글 UI label | code |
|---|---|
| 설렘 | `excitement` |
| 행복 | `happiness` |
| 따뜻함 | `warmth` |
| 힐링 | `healing` |
| 재미 | `fun` |
| 특별함 | `specialness` |
| 감동 | `moved` |
| 위로 | `comfort` |
| 기타 | `other` |

### Q11 — `q11_brand_attributes` → `BrandAttribute`

| 한글 UI label | code |
|---|---|
| 설렘 | `excitement` |
| 행복 | `happiness` |
| 따뜻함 | `warmth` |
| 힐링 | `healing` |
| 재미 | `fun` |
| 특별함 | `specialness` |
| 감동 | `moved` |
| 위로 | `comfort` |
| 기타 | `other` |

### Q16 — `q16_pain_points` → `InstagramPainPoint`

| 한글 UI label | code |
|---|---|
| 조회수가 안 나와요 | `low_reach` |
| 팔로워가 안 늘어요 | `low_follower_growth` |
| 어떤 콘텐츠를 만들지 모르겠어요 | `ideation` |
| 촬영이 어려워요 | `shooting_difficulty` |
| 편집이 어려워요 | `editing_difficulty` |
| 꾸준히 올리기 어려워요 | `consistency_difficulty` |
| 구매로 연결되지 않아요 | `low_conversion` |
| 기타 | `other` |

### Q17 — `q17_current_formats` → `CurrentReelFormat`

| 한글 UI label | code |
|---|---|
| 거의 안 올려요 | `rarely_post` |
| 완성품 위주 | `finished_product` |
| 제작 과정 위주 | `process` |
| 사진/영상 혼합 | `photo_video_mix` |
| 트렌드 릴스 | `trend_reels` |
| 브이로그 | `vlog` |

### Q18 — `q18_disclosure` → `CreatorDisclosure`

| 한글 UI label | code |
|---|---|
| 네 | `yes` |
| 아니요 | `no` |
| 얼굴만 | `face_only` |
| 목소리만 | `voice_only` |

`other`(기타)를 골라도 별도 자유입력 필드(`*_other_text`)는 **v1에 없다**. 기타의 내용은 인접 자연어 문항(예: Q7/Q14)에 쓰도록 UI에서 안내한다.

## 5. Q10 / Q11 namespace 분리

`q10_desired_emotions`(`DesiredEmotion`)와 `q11_brand_attributes`(`BrandAttribute`)는 **같은 한글 label과 같은 code 문자열**을 쓰지만 별개의 필드·별개의 enum 타입이다. Q10은 *고객이 느낄 감정*, Q11은 *브랜드가 갖고 싶은 속성*으로 AI가 다르게 해석한다. 프론트에서 하나의 선택 상태를 두 필드에 복사하지 말 것.

## 6. Q18 hard constraint 의미

`q18_disclosure` → 백엔드가 `face_allowed`/`voice_allowed`를 파생하고 **AI 추천이 이를 위반하면 결과를 반환하지 않는다**(1회 수리 후 실패 시 `REPAIR_FAILED`).

| code | UI label | face_allowed | voice_allowed |
|---|---|---|---|
| `yes` | 네 | true | true |
| `no` | 아니요 | false | false |
| `face_only` | 얼굴만 | true | false |
| `voice_only` | 목소리만 | false | true |
| `null` | 미응답 | 제약 없음 | 제약 없음 |

## 7. Q19 부재

Q19는 원본 문진에 존재하지 않는다. `answers`에 `q19_*` 필드가 있으면 `INVALID_REQUEST`로 거부된다. 문항 번호는 18 → 20으로 건너뛴다.

## 8. Media / count / size / MIME

| 용도 | multipart 필드 | 개수 | 허용 MIME | 크기 |
|---|---|---|---|---|
| 문진 제품 이미지 | `product_image` | **0..1** | `image/jpeg` / `image/png` / `image/webp` | 파일당 ≤ 1,250,000 bytes |
| 처방 Insight 스크린샷 | `insight_images` | **정확히 3** | `image/jpeg` / `image/png` / `image/webp` | 파일당 ≤ 900,000 bytes, 합산 ≤ 2,700,000 bytes |

- **PDF는 지원하지 않는다**(`INVALID_IMAGE_TYPE` 415). `image/jpg` 같은 비표준 MIME도 거부된다.
- 선언 MIME뿐 아니라 실제 바이트 포맷도 검사한다(GIF 바이트를 `image/png`로 보내면 거부).
- 서버는 이미지를 EXIF 회전 보정·RGB·축소·JPEG 재인코딩만 하며 저장하지 않는다. 브라우저 1차 압축은 권장이지만 계약 조건은 위 한도뿐이다.

## 9. Instagram URL 의미 (`PrescriptionRequestV1.instagram_url`)

- **개별 Reel URL만** 허용: `https://www.instagram.com/reel/<shortcode>/` (또는 `/reels/<shortcode>`; 호스트 `instagram.com`, `www.`, `m.`; 뒤 슬래시·쿼리스트링 허용).
- `/p/<shortcode>` 일반 게시물, `/tv/`, 프로필, 스토리, 타 도메인은 `INVALID_INSTAGRAM_URL`.
- v1 백엔드는 URL을 **크롤링하거나 열어보지 않는다.** 결과의 근거는 오직 스크린샷 3장이며 URL은 어떤 릴스에 대한 처방인지 표시하는 식별자일 뿐이다. 프론트는 "URL을 분석했다"는 문구를 쓰지 않는다.

## 10. Success / Error envelope 의미

```json
{"ok": true,  "request_id": "…", "contract_version": "1.0", "data": { …DiagnosisReportV1 | PrescriptionReportV1… }}
{"ok": false, "request_id": "…", "contract_version": "1.0", "error": {"code": "…", "message": "…", "retryable": bool, "details": []}}
```

- `ok`로 분기한다. `ok:true`이면 `data`는 **완전한** 리포트다(부분 실패 섹션 없음; 스키마+의미 검증을 통과한 결과만 반환).
- `data.schema_version`은 `"diagnosis.v1"` / `"prescription.v1"`. `priorities`·`reel_types`는 정확히 3개, `next_actions`는 정확히 4개, `structure`는 5개 고정 슬롯(`hook_0_3, body_3_10, body_10_20, close_20_27, cta_27_30`).
- 리포트 값은 **데이터만** 담는다. 섹션 제목("추천 포지셔닝" 등)은 프론트 상수다.
- `error.message`는 사용자에게 보여도 되는 한국어 문장이다. 제공자 예외 텍스트는 절대 포함되지 않는다. `error.details`는 자유형 리스트(검증 위치, 한도 값 등)다.
- HTTP 404 등 라우팅 오류도 같은 봉투로 온다.

## 11. error.code + retryable 처리 규칙

| error.code | HTTP | retryable | 발생 endpoint | 의미 / 프론트 처리 |
|---|---:|---|---|---|
| `INVALID_REQUEST` | 422 | false | diagnosis, prescription | payload JSON이 계약과 불일치(q19 포함, 알 수 없는 필드, enum 외 코드, 4개 이상 선택 등). `details[].loc`로 필드 표시 |
| `INSUFFICIENT_INPUT` | 422 | false | diagnosis | 문진 답변이 하나도 없고 이미지도 없음. 문진으로 복귀 |
| `INVALID_IMAGE_TYPE` | 415 | false | diagnosis, prescription | 허용되지 않는 MIME 또는 디코딩 불가. 업로드 영역 오류 |
| `IMAGE_TOO_LARGE` | 413 | false | diagnosis, prescription | 파일/합산 용량 초과. 브라우저 재압축 후 재시도 |
| `INVALID_IMAGE_COUNT` | 422 | false | prescription | 처방전 스크린샷이 정확히 3장이 아님 |
| `INVALID_INSTAGRAM_URL` | 422 | false | prescription | 개별 Reel URL이 아님(/p/, 프로필, 타 도메인 등) |
| `MODEL_TIMEOUT` | 504 | true | diagnosis, prescription | 단계 timeout 또는 전체 deadline 초과. 입력 유지한 채 공통 retry |
| `MODEL_PROVIDER_ERROR` | 502 | true | diagnosis, prescription | Gemini upstream 오류. 공통 retry |
| `MODEL_SCHEMA_ERROR` | 502 | true | diagnosis, prescription | 모델 출력이 JSON 스키마 불일치. 공통 retry |
| `MODEL_CONTENT_ERROR` | 502 | true | diagnosis, prescription | 모델이 유효한 내용을 반환하지 못함(안전 차단, 토큰 초과 등). 공통 retry |
| `REPAIR_FAILED` | 502 | true | diagnosis, prescription | 1회 수리 후에도 의미 검증 실패. 공통 retry |
| `INTERNAL_ERROR` | 500 | false | diagnosis, prescription | 서버 내부 오류. 공통 오류 화면 |

규칙:
1. `retryable:true` → 입력(draft)을 보존한 채 같은 요청을 **그대로 재시도**할 수 있다(공통 "다시 시도" 화면). 백엔드 상태가 없으므로 멱등하다.
2. `retryable:false` → 재시도해도 같은 결과다. 입력을 고쳐야 한다(`details[].loc`/`field`로 어느 입력인지 표시).
3. 프론트는 `code`로만 분기한다. `message`는 표시용, HTTP status는 보조 신호다.
4. 클라이언트 측 timeout(AbortSignal)은 `MODEL_TIMEOUT`과 동일하게 취급한다.

## 12. 경계: 프론트가 알 필요 없는 것

프론트는 `02_openapi.json`의 public 모델(`SurveyDiagnosisRequestV1`, `PrescriptionRequestV1`, `DiagnosisReportV1`, `PrescriptionReportV1`, 봉투, `HealthResponse`)만 다룬다. 다음은 백엔드 내부이며 계약이 아니다: `DeclaredEvidenceV1`, `VisualObservationV1`, `InsightObservationV1`, `EvidencePackV1`, `InferencePolicyV1`, 프롬프트 버전, 검증기/수리 로직, Gemini 모델명·thinking·토큰 예산. 이들이 바뀌어도 이 계약은 바뀌지 않는다. 반대로 이 문서의 어떤 항목이 바뀌면 `contract_version`이 올라간다.
