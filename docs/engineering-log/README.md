# Engineering log

이 폴더는 SOSU를 만들고 출시하기까지 남긴 작업 기록입니다. 각 문서는 작성 시점의 사실만 담고 있어서 뒤에 바뀐 내용은 반영되어 있지 않습니다. 최신 상태는 루트 `README.md`를 보세요.

| 시점 | 문서 | 내용 |
|---|---|---|
| 2026-09-13 | [HANDOFF.md](HANDOFF.md), [STATUS.md](STATUS.md) | 프론트 MVP를 동결할 당시의 인수인계 문서. 상단 배너에 이후 바뀐 사항이 정리되어 있음 |
| Stage 0 | [SOSU_STAGE0_ENVIRONMENT_AUDIT.md](SOSU_STAGE0_ENVIRONMENT_AUDIT.md) | 통합 작업 전 읽기 전용으로 수행한 환경 및 아키텍처 감사 |
| Stage 1 | [SOSU_STAGE1_INTEGRATION_REPORT.md](SOSU_STAGE1_INTEGRATION_REPORT.md), [SOSU_STAGE1_TEST_MATRIX.md](SOSU_STAGE1_TEST_MATRIX.md) | 프론트와 FastAPI의 실제 HTTP 통합, fake gateway 서버 구축 |
| Stage 1 | [SOSU_GUIDEBOOK_KNOWLEDGE_REPORT.md](SOSU_GUIDEBOOK_KNOWLEDGE_REPORT.md) | 가이드북을 KnowledgePack(규칙 93개)으로 만들고 프롬프트에 주입 |
| Phase 2 | [SOSU_PHASE2_GEMINI_ACTIVATION.md](SOSU_PHASE2_GEMINI_ACTIVATION.md), [SOSU_PHASE2_TEST_EVIDENCE.md](SOSU_PHASE2_TEST_EVIDENCE.md), [SOSU_PHASE2_FINAL_REPORT.md](SOSU_PHASE2_FINAL_REPORT.md) | 라이브 Gemini 검증, Vercel 배포, 공개 런타임 게이트 적용 |
| Phase 2 | [SOSU_VERCEL_RELEASE_AUDIT.md](SOSU_VERCEL_RELEASE_AUDIT.md), [SOSU_REMAINING_DECISIONS.md](SOSU_REMAINING_DECISIONS.md) | 배포 감사, 남은 결정 사항(RD-1~9) |
| Phase 3 | [SOSU_RD5_GROUNDING_EVIDENCE.md](SOSU_RD5_GROUNDING_EVIDENCE.md) | 처방에서 근거 없는 내용이 생성되던 문제(RD-5)의 원인 분석과 수정 |
| Phase 3 | [SOSU_SECURITY_ACTIVATION_MATRIX.md](SOSU_SECURITY_ACTIVATION_MATRIX.md), [SOSU_PHASE3_RELEASE_AUDIT.md](SOSU_PHASE3_RELEASE_AUDIT.md) | 게이트 G1~G12 확인, WAF 설정, 공개 활성화 |
| Phase 3 | [SOSU_OWNER_FINAL_HANDOFF.md](SOSU_OWNER_FINAL_HANDOFF.md) | 운영자용 안내: 비용 상한, 키 교체, 롤백 절차 |
| 출시 후 | [SOSU_PROD_E2E_PLAYWRIGHT.md](SOSU_PROD_E2E_PLAYWRIGHT.md) | 운영 환경 Playwright E2E 결과(무료 14건, 라이브 2건, WAF) |

이 폴더로 옮기면서 문서 안의 커밋 해시와 경로는 작성 당시 값 그대로 두었습니다. 그 뒤 README와 문서 정리 커밋이 배포되었기 때문에 운영 빌드 SHA는 문서에 적힌 값보다 새 값입니다.

## 남은 일 (2026-10-18 마감 기준)

| 항목 | 상태 | 다음 행동 |
|---|---|---|
| 리포트 이메일 + 가이드북 PDF 링크 | 코드 배포 완료. 설정이 없어 **꺼져 있음** | 오너가 `SOSU_py/docs/EMAIL_SETUP_GUIDE.md` 를 따라 설정합니다. 진행 상태는 `python3 SOSU_py/scripts/check_email_setup.py` 로 확인합니다 |
| 메일 화면 고양이 모션 교체 (손·얼굴 분리) | **미착수** | Figma MCP 인증이 완료되지 않음. 디자인은 Figma `BfiDWIgNkLyst263m82VLK` 노드 `46-173`. 현재는 `cat-delivery.png` 한 장에서 앞발 영역을 잘라 움직이는 방식 |
| 진단 결과가 연속으로 repair 1회를 거침 | 관찰 중 (2026-11-01 로컬 실모델 재현: 원인 후보는 structure 문장의 Q18 얼굴 키워드, 예 '표정') | 운영 라이브 진단 2건이 모두 REPAIRABLE → PASS 였음. 원인 오류 문구는 로그에 남지 않으므로, 필요하면 repair 사유를 로그로 남기도록 추가 |

## 2026-11-01 릴스 유형을 가이드북 A~F로

- 진단의 추천 릴스 유형이 매번 모델이 지은 자유 이름이었던 문제를 고쳤습니다. 이제 가이드북 2장의 세 축(순서 A/B, 사운드 C/D, 자막 E/F)에서 하나씩 고르고, 화면에는 "추천 조합 · B + D + F"와 축 라벨이 표시됩니다.
- 백엔드 `SOSU_py@a3254eb`(prompt `diagnosis-v3`), 공개 계약 형태는 그대로입니다.
- 검증: pytest 428, web verify(e2e 48 · media 6 · adapter 13), integration 25, 운영 Playwright 무료 14. 로컬 실모델 4건에서 입력별 조합 B+D+F / A+C+F / B+C+F, REPAIR_FAILED 0.
- 메일: 비영리 무료 도메인(is-a.dev)으로 Resend 도메인 인증을 진행 중입니다. 인증 전까지 `SOSU_PUBLIC_EMAIL_ENABLED`는 꺼 둡니다.
