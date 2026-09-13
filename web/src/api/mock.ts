// Mock transport behind api/client.ts. Not a contract authority — fixtures exist only so the UI can be exercised.
// Debug knobs (mock only, read from the URL of the generating route):
//   ?fail=timeout|error   → generation rejects with that ApiError kind
//   ?fixture=long         → long-content stress fixture (layout QA, HANDOFF §8-7)

import type { Answers } from '../data/questions';
import type { PrescriptionReport, SurveyReport } from '../data/report';
import { ApiError } from './errors';
import type { RequestOptions } from './client';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
  });

const knob = (name: string) => new URLSearchParams(window.location.search).get(name);
const pick = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

const LONG_PARAGRAPH = '릴스는 첫 프레임에서 시청자가 계속 볼 이유를 만들어야 하고, 그 이유는 제품 자체보다 제품이 만들어내는 장면에서 나옵니다. 빛을 받아 반짝이는 순간, 손끝에서 형태가 잡히는 순간, 완성된 제품이 공간에 놓이는 순간처럼 감정이 먼저 전달되는 장면을 앞에 두고 설명은 뒤로 미루세요. 자막은 한 줄에 열다섯 자를 넘기지 않도록 끊고, 같은 장면을 두 번 보여주기보다 다른 각도의 장면으로 리듬을 만드는 편이 이탈률을 낮춥니다.';

function longSurveyFixture(name: string): SurveyReport {
  return {
    brand: { name, material: '유리, 도자, 황동 와이어, 천연 원석 비즈, 리넨 코드', product: '밤하늘 시리즈 목걸이 및 귀걸이 세트 (한정 제작 라인 포함)', keywords: '별, 달, 밤, 하늘, 빛, 기억, 위로, 선물, 공간, 수작업' },
    positioning: `${name}은(는) "밤하늘을 손에 쥐는 순간"을 파는 브랜드입니다. ${LONG_PARAGRAPH}\n\n같은 제품을 반복 노출하기보다 제품이 놓이는 맥락을 바꿔가며 보여주는 것이 포지셔닝의 핵심이며, 이는 릴스의 구조와 자막 톤 전체에 일관되게 적용되어야 합니다.`,
    positioningRationale: `${LONG_PARAGRAPH}\n\n문진표 답변에서 반복적으로 나타난 키워드(빛, 기억, 위로)와 선택한 매력 요소(소재, 제작 과정, 스토리)가 서로를 강화하는 방향으로 정리했습니다.`,
    strengths: `① 유리·도자 소재의 빛 반사 — 릴스에서 시각적 훅이 가장 강한 요소이며, 조명 한 개만으로도 첫 프레임의 밀도를 확보할 수 있습니다. ${LONG_PARAGRAPH}\n② 소량 수작업 — 희소성 스토리를 자막 한 줄로 전달할 수 있고, 제작 과정 컷과 결합하면 신뢰의 근거가 됩니다.\n③ 별·달 모티프의 일관성 — 브랜드 인지 자산으로, 썸네일 그리드에서 계정 정체성을 즉시 드러냅니다.`,
    target: '20대 후반~30대 초반 여성, 자기 선물 · 공간 꾸미기 목적.\n감성 계정을 팔로우하고 저녁 시간대에 릴스를 소비하며, 구매 전 계정 그리드 전체를 훑어보는 습관이 있습니다.\n선물 시즌(연말, 생일)에 저장 행동이 급증하고, 댓글보다 DM으로 문의하는 경향이 뚜렷합니다.\n가격보다 "이 브랜드에서만 살 수 있는가"를 먼저 확인합니다.',
    tone: `차분하고 따뜻한 밤의 톤. 과장 없는 1인칭 서술, 문장은 짧게. 배경음은 로파이 계열. ${LONG_PARAGRAPH}`,
    fonts: { title: 'Pretendard SemiBold (썸네일&카피) — 자간 -2%, 두 줄 이내, 배경 대비 확보를 위해 반투명 박스 사용 권장', subtitle: 'SUITE Regular (자막) — 한 줄 15자 이내, 화면 하단 1/4 지점 고정' },
    priorities: [`빛을 받아 반짝이는 완성품 클로즈업. ${LONG_PARAGRAPH}`, `제작 과정 중 가장 손이 많이 가는 장면. ${LONG_PARAGRAPH}`, `착용/배치된 실제 사용 장면. ${LONG_PARAGRAPH}`],
    reelTypes: [`유형 A — 3초 훅 + 완성품. ${LONG_PARAGRAPH}`, `유형 C — 제작 과정 타임랩스. ${LONG_PARAGRAPH}`, `유형 F — 비포/애프터 공간. ${LONG_PARAGRAPH}`],
    guidebookNote: '*릴스 유형은 가이드북 12페이지 참고 — 각 유형의 촬영 체크리스트와 예시 계정은 가이드북 부록에 정리되어 있습니다.',
    structure: [
      { range: '0~3초', guide: `반짝임 클로즈업으로 시선 고정. ${LONG_PARAGRAPH}` },
      { range: '3~10초', guide: `어떤 제품인지 한 문장 자막. ${LONG_PARAGRAPH}` },
      { range: '10~20초', guide: `제작 과정 핵심 컷 2~3개. ${LONG_PARAGRAPH}` },
      { range: '20~27초', guide: `사용 장면 + 감정 자막. ${LONG_PARAGRAPH}` },
      { range: '27~30초', guide: `브랜드명 + 프로필 유도. ${LONG_PARAGRAPH}` },
    ],
    finalGuidance: Array.from({ length: 12 }, (_, i) => `${i + 1}. ${LONG_PARAGRAPH.slice(0, 60 + (i * 17) % 90)}`).join('\n'),
  };
}

const LONG_PRESCRIPTION: PrescriptionReport = {
  prescription: `현재 릴스는 초반 3초의 이탈 가능성이 높습니다. ${LONG_PARAGRAPH}\n\n${LONG_PARAGRAPH}\n\n첫 1~2초 안에 결과물을 먼저 보여주고, 현재의 설명형 도입부는 삭제하세요.`,
  nextActions: [`첫 장면에 결과물 배치. ${LONG_PARAGRAPH}`, `첫 자막은 10~15자 이내. ${LONG_PARAGRAPH}`, `설명보다 결과를 먼저 보여주기. ${LONG_PARAGRAPH}`, `동일한 주제로 A/B 테스트 진행. ${LONG_PARAGRAPH}`, `업로드 후 3일 뒤 인사이트를 다시 캡처해 비교. ${LONG_PARAGRAPH}`],
  tone: `차분하고 따뜻한 밤의 톤을 유지하되, 첫 자막만 선언형으로. ${LONG_PARAGRAPH}`,
};

export async function generateDiagnosis(answers: Answers, opts: RequestOptions = {}): Promise<SurveyReport> {
  await wait(2800, opts.signal);
  const fail = knob('fail');
  if (fail === 'timeout' || fail === 'error') throw new ApiError(fail);
  const name = pick(answers.q01, '반짝이는 모든 것들');
  if (knob('fixture') === 'long') return longSurveyFixture(name);
  return {
    brand: { name, material: pick(answers.q04, '유리, 도자'), product: pick(answers.q03, '목걸이'), keywords: '별, 달, 밤, 하늘' },
    positioning: `${name}은(는) "밤하늘을 손에 쥐는 순간"을 파는 브랜드입니다. 제품보다 제품이 만들어내는 장면을 먼저 보여주는 포지셔닝을 추천합니다.`,
    strengths: '① 유리·도자 소재의 빛 반사 — 릴스에서 시각적 훅이 강함\n② 소량 수작업 — 희소성 스토리\n③ 별·달 모티프의 일관성 — 브랜드 인지 자산',
    target: '20대 후반~30대 초반 여성, 자기 선물 · 공간 꾸미기 목적. 감성 계정을 팔로우하고 저녁 시간대에 릴스를 소비합니다.',
    tone: '차분하고 따뜻한 밤의 톤. 과장 없는 1인칭 서술, 문장은 짧게. 배경음은 로파이 계열.',
    fonts: { title: 'Pretendard SemiBold (썸네일&카피)', subtitle: 'SUITE Regular (자막)' },
    priorities: ['빛을 받아 반짝이는 완성품 클로즈업', '제작 과정 중 가장 손이 많이 가는 장면', '착용/배치된 실제 사용 장면'],
    reelTypes: ['유형 A — 3초 훅 + 완성품', '유형 C — 제작 과정 타임랩스', '유형 F — 비포/애프터 공간'],
    guidebookNote: '*릴스 유형은 가이드북 12페이지 참고',
    structure: [
      { range: '0~3초', guide: '반짝임 클로즈업으로 시선 고정' },
      { range: '3~10초', guide: '어떤 제품인지 한 문장 자막' },
      { range: '10~20초', guide: '제작 과정 핵심 컷 2~3개' },
      { range: '20~27초', guide: '사용 장면 + 감정 자막' },
      { range: '27~30초', guide: '브랜드명 + 프로필 유도' },
    ],
    finalGuidance: '1. 첫 프레임은 항상 제품이 빛나는 순간\n2. 자막은 10~15자 이내\n3. 같은 제품으로 A/B 2개 업로드\n…\n30. 주 2회 업로드 리듬 유지',
  };
}

export async function generatePrescription(_url: string, opts: RequestOptions = {}): Promise<PrescriptionReport> {
  await wait(2600, opts.signal);
  const fail = knob('fail');
  if (fail === 'timeout' || fail === 'error') throw new ApiError(fail);
  if (knob('fixture') === 'long') return LONG_PRESCRIPTION;
  return {
    prescription: '현재 릴스는 초반 3초의 이탈 가능성이 높습니다. 첫 화면에서 콘텐츠의 핵심 메시지가 바로 전달되지 않아 시청자가 계속 볼 이유가 약합니다.\n\n첫 1~2초 안에 결과물을 먼저 보여주고, 현재의 설명형 도입부는 삭제하세요. 자막도 "오늘 소개할 제품은…"보다는 "이 제품이 예쁜 이유는 딱 3가지입니다"처럼 결과와 궁금증을 동시에 만드는 방향을 추천합니다.',
    nextActions: ['첫 장면에 결과물 배치', '첫 자막은 10~15자 이내', '설명보다 결과를 먼저 보여주기', '동일한 주제로 A/B 테스트 진행'],
    tone: '차분하고 따뜻한 밤의 톤을 유지하되, 첫 자막만 선언형으로.',
  };
}

export async function sendReportEmail(email: string): Promise<void> {
  await wait(900);
  if (/fail@/i.test(email)) throw new ApiError('send-error');
}
