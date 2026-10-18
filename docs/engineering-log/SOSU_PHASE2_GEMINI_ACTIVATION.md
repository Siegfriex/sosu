# SOSU — Phase 2: Gemini 활성화 가이드 (사람용)

> 대상: 오너가 직접 실제 Gemini 키를 넣고 라이브 검증을 수행할 때.
> 이 문서에는 비밀값이 없습니다. 키는 **오직** `SOSU_py/.env.local`(gitignored)에만 넣으세요. 셸 히스토리·문서·커밋·스크린샷에 남기지 마세요.
> Phase 1(키 없는 통합) 결과는 `SOSU_STAGE1_INTEGRATION_REPORT.md`, `SOSU_STAGE1_TEST_MATRIX.md` 참고.

---

## 0. 전제 확인 (키 넣기 전, 1분)

```bash
cd /home/sieg/projects-wsl/sosu/SOSU_py
git status --short                      # 의도치 않은 변경 없는지
.venv/bin/pytest -q -o addopts=""       # 키 없이 전부 green 이어야 함 (live 1건 skip)
```

## 1. 자격 증명 입력

1. Google AI Studio(https://aistudio.google.com/apikey)에서 API 키 발급. 결제/쿼터 한도를 먼저 설정해 두세요(아래 §8 비용 측정 전 안전장치).
2. 편집기로 `SOSU_py/.env.local`을 열어 `GEMINI_API_KEY=` 줄의 placeholder(`PASTE_YOUR_GEMINI_API_KEY_HERE`)를 실제 키로 교체. **명령줄 `echo KEY >> …` 사용 금지**(히스토리 잔존).
3. 확인(값 출력 없이):
   ```bash
   cd /home/sieg/projects-wsl/sosu/SOSU_py
   .venv/bin/python -c "from app.config import get_settings as g; print('gemini_configured =', g().gemini_configured)"
   git check-ignore -v .env.local          # .gitignore 에 걸려 있어야 함
   ```

## 2. 실제 모델 ID 설정

현재 기본값은 `gemini-3.8-flash`(관찰·진단·처방 공통)이며 **Phase 1에서는 실재 여부를 검증하지 않았습니다.** 키를 넣은 뒤 계정에서 사용 가능한 모델을 직접 조회하세요:

```bash
cd /home/sieg/projects-wsl/sosu/SOSU_py
.venv/bin/python - <<'EOF'
from google import genai
from app.config import get_settings
c = genai.Client(api_key=get_settings().gemini_api_key.get_secret_value())
for m in c.models.list():
    acts = getattr(m, "supported_actions", None) or getattr(m, "supported_generation_methods", None)
    if "gemini" in m.name: print(m.name, acts)
EOF
```

`.env.local`에서 다음을 실제 ID로 지정(구조화 출력 + 이미지 입력 지원 모델):

| 변수 | 용도 | 권장 |
|---|---|---|
| `GEMINI_MODEL_OBSERVE` | 제품 이미지 / 인사이트 스크린샷 관찰 | 빠른 멀티모달 모델 |
| `GEMINI_MODEL_DIAGNOSIS` | 진단서 합성(가이드북 지식 포함) | 품질 우선 모델 |
| `GEMINI_MODEL_PRESCRIPTION` | 처방전 합성 | 품질 우선 모델 |
| `GEMINI_THINKING_*`, `GEMINI_MAX_OUTPUT_*`, `GEMINI_TIMEOUT_*` | 단계별 예산 | 기본값 유지 후 §8 측정으로 조정 |
| `SOSU_REQUEST_DEADLINE_SECONDS` | 전체 deadline(180s) | 프론트 클라이언트 timeout(190s)보다 작게 유지 |
| `SOSU_CORS_ORIGINS` | 허용 origin(쉼표 구분) | 로컬: `http://localhost:5173` |
| `SOSU_KNOWLEDGE_PATH` | 가이드북 KnowledgePack 경로 | 기본값(`knowledge/guidebook/knowledgepack.v1.json`) 유지 |
| `SOSU_RESEARCH_ENABLED` | 외부 리서치(처방) 활성화 | Phase 2 §6 검증 전까지 `false` |

## 3. Health 확인 (실제 서버)

```bash
cd /home/sieg/projects-wsl/sosu/SOSU_py
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000        # 프로덕션 엔트리 (fake 없음)
# 다른 터미널
curl -s http://127.0.0.1:8000/api/v1/health
# 기대: {"status":"ok","service":"sosu-ai","contract_version":"1.0","gemini_configured":true}
curl -s http://127.0.0.1:8000/__fake__/scenario -o /dev/null -w "%{http_code}\n"   # 기대: 404 (fake 라우트 부재)
```
주의: `scripts/serve_fake.py`는 **개발/테스트 전용**(결정론적 가짜 Gemini, 127.0.0.1 바인딩)입니다. 라이브 검증에는 반드시 `app.main:app`을 쓰세요.

## 4. 라이브 진단 스모크

```bash
cd /home/sieg/projects-wsl/sosu/SOSU_py
RUN_LIVE_GEMINI_TESTS=1 .venv/bin/pytest -q -o addopts="" tests/test_live_gemini.py     # 최소 구조화 호출 1건
# 엔드투엔드(HTTP) — 계약 fixture 그대로 전송
curl -s -X POST http://127.0.0.1:8000/api/v1/diagnosis \
  -H 'X-Request-ID: live-diag-001' \
  -F "payload=$(cat contracts/fixtures/diagnosis.request.json)" \
  -F "product_image=@/path/to/product.jpg;type=image/jpeg" | .venv/bin/python -m json.tool | head -60
```
확인 포인트: `ok:true`, `data`가 계약 스키마와 일치, 브랜드 원문이 왜곡되지 않음, 가이드북 기반 추천(릴스 유형·구조·후킹·캡션·CTA)이 설문 답변(Q16/Q17/Q18)에 따라 달라지는지 2~3개 상이한 설문으로 비교.

## 5. 라이브 처방 스모크

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/prescription \
  -H 'X-Request-ID: live-presc-001' \
  -F "payload=$(cat contracts/fixtures/prescription.request.json)" \
  -F "insight_images=@/path/insight1.jpg;type=image/jpeg" \
  -F "insight_images=@/path/insight2.jpg;type=image/jpeg" \
  -F "insight_images=@/path/insight3.jpg;type=image/jpeg" | .venv/bin/python -m json.tool | head -60
```
확인 포인트: 스크린샷에 없는 수치를 만들어내지 않는지(판독 불가 → 불확실성 명시), 상관을 인과로 단정하지 않는지, `next_actions` 4개가 우선순위·실행 가능성 있게 나오는지.

## 6. 외부 리서치(처방) 기능 검증

Phase 1 상태: 리서치 경계(`app/research/`)와 `NullResearchProvider`(기본, "unavailable" 반환 — 결과 조작 없음), 테스트용 fixture provider만 존재. 라이브 검색 연동 여부와 SDK 지원 확인 결과는 `SOSU_py/docs/RESEARCH_BOUNDARY.md`에 기록.
1. 해당 문서의 SDK 기능(Google Search grounding 등)이 선택한 모델에서 지원되는지 §2 모델 목록과 대조.
2. 구현 후 `SOSU_RESEARCH_ENABLED=true`로 켜고, 응답 근거에 **출처 URL·조회일**이 실제로 붙는지, 가이드북 원칙과 외부 사실이 프롬프트·출력에서 구분되는지 확인.
3. 검색 실패 시 처방이 "리서치 없음"으로 정상 완료되는지(provider failure → 처방 실패 아님) 확인.

## 7. 구조화 출력 유효성

- 서버 로그에서 `MODEL_SCHEMA_ERROR` / `REPAIR_FAILED` / `MODEL_CONTENT_ERROR` 발생 빈도 확인.
- 동일 입력 5회 반복 → 모두 `ok:true`인지, repair 발생 횟수.
- 실패 응답의 `request_id`로 로그를 추적(요청 본문은 로그에 남기지 않음).

## 8. 지연·실패율·비용 측정

```bash
for i in 1 2 3 4 5; do
  /usr/bin/time -f "%e s" curl -s -o /tmp/sosu_live_$i.json -w "%{http_code} " -X POST http://127.0.0.1:8000/api/v1/diagnosis \
    -H "X-Request-ID: live-lat-$i" -F "payload=$(cat contracts/fixtures/diagnosis.request.json)"
done
```
- p50/p95 지연을 기록하고 단계별 timeout(관찰 45s / 합성 90s / repair 40s / 전체 180s)과 비교.
- 비용: Google AI Studio 사용량 대시보드에서 요청당 토큰(입력·출력·thinking)과 금액을 확인. 가이드북 지식 블록이 입력 토큰을 늘리므로 진단·처방 각각 측정.
- 실패율 = 비-200 응답 / 전체. 재시도 정책은 클라이언트 '다시 시도'(사용자 주도)뿐임을 유의.

## 9. 전체 라이브 E2E (브라우저)

```bash
# 터미널 1 — 실제 백엔드
cd /home/sieg/projects-wsl/sosu/SOSU_py && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
# 터미널 2 — 프론트 (http 모드가 기본)
cd /home/sieg/projects-wsl/sosu/web && VITE_API_MODE=http VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev   # http://localhost:5173
```
브라우저에서 문진표(이미지 포함/미포함)·처방전(스크린샷 3장)을 끝까지 수행. 자동화된 통합 E2E(`npm run e2e:integration`)는 **fake 서버 전용**이며 라이브 키로 실행하면 안 됩니다(시나리오 엔드포인트 의존 + 비용).

## 10. 경계별 장애 조사

| 증상 | 경계 | 확인 |
|---|---|---|
| 브라우저 콘솔 CORS 오류 | 프론트 ↔ API | `SOSU_CORS_ORIGINS`에 프론트 origin 포함? |
| 즉시 '완료하지 못했어요' + 콘솔 `request_id` | API 응답 | 서버 로그에서 해당 `request_id` 검색 → error.code |
| `MODEL_PROVIDER_ERROR` 502 | Gemini 호출 | 키 유효성·쿼터·모델 ID(§2) |
| `MODEL_TIMEOUT` 504 | Gemini 지연 | 단계별 timeout, thinking 수준, 이미지 크기 |
| `MODEL_SCHEMA_ERROR` / `REPAIR_FAILED` | 구조화 출력 | 모델 변경, max_output 부족 여부 |
| `MODEL_CONTENT_ERROR` | 의미 검증(placeholder 80%↑) | 프롬프트·지식 블록 길이 |
| `IMAGE_TOO_LARGE` / `INVALID_IMAGE_*` | 업로드 | 프론트 `media/prepare*` 예산 적용 여부 |
| 결과 화면 일부 섹션 비어 있음 | 응답 adapter | `web/src/api/adapters.ts` ↔ 계약 필드 |
| 가이드북 미반영 | 지식 계층 | 로그의 knowledge version(`gb2-5edea367`), `SOSU_KNOWLEDGE_PATH` |

## 11. 하지 말 것
- 키를 커밋·문서·이슈·채팅에 붙여넣기.
- 프로덕션/공개 서버에서 `scripts/serve_fake.py` 실행.
- 라이브 키로 자동 E2E 반복 실행(비용).
- Vercel 배포 설정 변경 — 현재 배포는 Mock MVP. http 모드 배포는 백엔드 공개 URL·CORS·비용 한도가 정해진 뒤 별도 결정.
