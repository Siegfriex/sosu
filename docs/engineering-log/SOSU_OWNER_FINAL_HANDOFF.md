# SOSU — Owner Final Handoff (2026-10-18)

현재 상태:
- 코드, WAF, 게이트 G1~G12는 모두 준비됐습니다.
- 공개 AI 생성 스위치만 꺼져 있습니다. 아래 §4가 그 스위치를 켜는 절차입니다.
- 이 문서에는 비밀값이 없습니다.

## 1. $10 상한 확인 (G3, owner-attested)
1. Google AI Studio → **Spend** → **Monthly spend cap** 화면에서 **$10**인지 확인합니다. 바꿔야 하면 **Edit spend cap**에서 수정합니다.
2. 청구 데이터는 약 10분 늦게 반영됩니다. 그래서 상한을 조금 넘는 지출이 생길 수 있습니다.
3. Vercel Pro 지출 알림(선택): Vercel → Team Settings → Billing → **Spend Management**에서 알림 임계값을 설정합니다.
   - 팀 전체 production 일시정지 옵션은 다른 프로젝트에도 영향을 줍니다. 켤지는 직접 판단해 주세요.

## 2. API 키 교체 절차 (필요할 때만)
현재 판단은 "교체 불필요"입니다. 사용량에 이상이 없다고 확인해 주셨기 때문입니다. 교체가 필요해지면 아래 순서를 따르세요.
1. AI Studio에서 새 키를 발급합니다. 구 키는 아직 지우지 않습니다.
2. Vercel → sosu-py → Settings → Environment Variables → `GEMINI_API_KEY`(Production, Preview) 값을 새 키로 바꿉니다.
3. Deployments → 최신 Production(현재 `d345e0d`) → **Redeploy**를 누릅니다.
4. `curl https://sosu-py.vercel.app/api/v1/health`로 `gemini_configured:true`인지 확인합니다.
5. AI Studio에서 구 키를 **삭제**합니다.
6. 로컬 `SOSU_py/.env.local`의 키도 바꿉니다. 편집기를 쓰고, 셸 히스토리에 키가 남지 않게 하세요.

## 3. WAF 규칙 (이미 적용됨)
- 위치: Vercel → sosu-py → **Firewall** → 규칙 "SOSU AI combined 3/min/IP"
- 조건: (POST AND path = `/api/v1/diagnosis`) OR (POST AND path = `/api/v1/prescription`)
- 동작: IP 기준 60초에 3회까지 허용(fixed window), 초과하면 429를 반환합니다.
- 규칙이 하나라서 두 경로가 카운터를 함께 씁니다. 14:52~14:55 실측으로 4번째 요청부터 차단되는 것을 확인했습니다.
- 한계: IP 단위 제한입니다. 여러 IP로 분산된 공격에 대한 금액 상한은 §1의 $10 상한이 담당합니다.

## 4. 공개 추론 활성화 (남은 단 하나의 작업)
1. Vercel → **sosu-py** → Settings → Environment Variables → **Add**
   - Key: `SOSU_PUBLIC_INFERENCE_ENABLED`
   - Value: `true`
   - Environment: **Production만**
2. Deployments → 최신 Production `d345e0d` → **Redeploy**를 누릅니다. env 변경은 새 배포에만 적용됩니다.
3. 확인합니다.
   ```bash
   curl -s https://sosu-py.vercel.app/api/v1/features
   # 기대값: inference.enabled=true, email.enabled=false, image_storage.enabled=false, research.enabled=false,
   #         knowledge_version=gb2-5edea367, build=d345e0d9c67a
   ```
4. https://sosu-rosy.vercel.app 에서 진단 1건(또는 처방 1건)을 직접 실행해 결과 화면이 뜨는지 봅니다. 이 실행은 유료 호출 1건입니다.
   - 원하시면 Claude에게 "활성화 확인해줘"라고 하세요. features 조회와 브라우저 스모크 1건을 실행해 드립니다.

CLI로 하려면 다음 명령을 쓰면 됩니다. 프롬프트에 `!`를 붙여 실행하세요.
```bash
cd /home/sieg/projects-wsl/sosu/SOSU_py && printf 'true' | npx vercel env add SOSU_PUBLIC_INFERENCE_ENABLED production --scope siegfriexs-projects
```
- 이 명령은 env만 추가합니다. 재배포는 대시보드 Redeploy로 하거나, 백엔드 커밋을 push하세요.

## 5. 롤백 (활성화 후 문제가 생기면)
1. Vercel → sosu-py → Environment Variables에서 `SOSU_PUBLIC_INFERENCE_ENABLED`를 `false`로 바꾸거나 삭제합니다.
2. 최신 Production(`d345e0d`)을 **Redeploy**합니다.
3. `/api/v1/features`의 `inference.enabled`가 `false`인지 확인합니다.
4. 진단 POST가 503 `SERVICE_UNAVAILABLE`을 반환하는지 확인합니다.
5. **`3d19714`(`dpl_E4zvKfs1…`)로는 절대 롤백하지 마세요.** 공개 유료 추론이 게이트 없이 다시 열립니다.
- 프론트 롤백이 필요할 때 대상은 `sosu`의 직전 READY 배포입니다.

## 6. 계속 꺼 둘 기능
- 이메일: `SOSU_PUBLIC_EMAIL_ENABLED`를 설정하지 않음. Resend 자격 증명도 넣지 않음.
- 이미지 저장: 구현하지 않음(요청 처리 중에만 사용). `SOSU_IMAGE_RETENTION_DAYS`는 설정하지 않음.
- 외부 리서치: `SOSU_RESEARCH_ENABLED`를 설정하지 않음(기본 false).
- Q18: 목소리 불가이면 나레이션과 TTS 모두 금지. 현재 constraint와 validator가 이렇게 동작합니다.

## 7. 남은 위험
- RD-5 검증은 단어 목록과 휴리스틱 기반입니다. 핸들과 무관하게 지어낸 내용은 프롬프트에만 의존합니다. 자세한 내용은 `SOSU_RD5_GROUNDING_EVIDENCE.md`에 있습니다.
- 로컬 `SOSU_py/.env.local`에는 `SOSU_PUBLIC_INFERENCE_ENABLED=true`와 `GEMINI_TIMEOUT_OBSERVE=45`가 들어 있습니다.
  - 로컬 실행에만 영향을 주고, 운영과는 무관합니다.
  - 공개 런타임에서만 게이트가 적용되므로 로컬에서 이 플래그는 효과가 없습니다.
