// Canonical question model — mirrors 06_Handoff §M in Figma (ejRfXQERdNsBWbKYEdemRB).
// Copy is verbatim from legacy except the recorded normalizations (Q8 helper removed,
// Q9 duplicate option removed, Q12 "*최대 3개 선택" removed). Q19 is absent in the source.

export type ChoiceLayout = 'grid3' | 'grid2' | 'full';

// Choice answers are stored as stable codes, never as the Korean label.
export interface ChoiceOption { code: string; label: string }
const opts = (pairs: [string, string][]): ChoiceOption[] => pairs.map(([code, label]) => ({ code, label }));

export type Question =
  | {
      id: string;
      number: number;
      section: 1 | 2 | 3;
      type: 'text';
      label: string;
      helperText?: string;
      placeholder?: string;
      required?: boolean; // UNRESOLVED (no source evidence) — defaults to false
    }
  | {
      id: string;
      number: number;
      section: 1 | 2 | 3;
      type: 'choice';
      label: string;
      options: ChoiceOption[];
      layout: ChoiceLayout;
      selection: 'single' | 'multiple';
      maxSelection?: number;
      required?: boolean;
    };

const EMOTIONS = opts([['excitement', '설렘'], ['happiness', '행복'], ['warmth', '따뜻함'], ['healing', '힐링'], ['fun', '재미'], ['specialness', '특별함'], ['touching', '감동'], ['comfort', '위로'], ['other', '기타']]);

export const SECTIONS: Record<1 | 2 | 3, string> = {
  1: '브랜드 기본 정보',
  2: '고객과 브랜드 이미지',
  3: '릴스의 방향성',
};

export const QUESTIONS: Question[] = [
  { id: 'q01', number: 1, section: 1, type: 'text', label: '1. 브랜드 이름은 무엇인가요?' },
  { id: 'q02', number: 2, section: 1, type: 'text', label: '2. 어떤 제품을 만들고 있나요? *제품군을 입력해주세요.', helperText: '예) 액세서리 / 인형 / 식기류' },
  { id: 'q03', number: 3, section: 1, type: 'text', label: '3. 가장 자신 있는 제품은 무엇인가요?' },
  { id: 'q04', number: 4, section: 1, type: 'text', label: '4. 주로 어떤 소재를 사용하나요?', helperText: '예) 섬유 / 유리 / 나무 / 비즈' },
  { id: 'q05', number: 5, section: 1, type: 'text', label: '5. 이 소재를 사용하는 이유는 무엇인가요?' },
  {
    id: 'q06', number: 6, section: 1, type: 'choice',
    label: '6. 내 제품의 가장 큰 매력은 무엇인가요? *최대 3개 선택',
    options: opts([['design', '디자인'], ['color', '색감'], ['detail', '디테일'], ['texture', '질감'], ['material', '소재'], ['process', '제작 과정'], ['story', '스토리'], ['scarcity', '희소성'], ['other', '기타']]),
    layout: 'grid3', selection: 'multiple', maxSelection: 3,
  },
  { id: 'q07', number: 7, section: 1, type: 'text', label: '7. 비슷한 제품과 무엇이 다른가요? *우리 브랜드만의 차별점을 입력해주세요.' },

  { id: 'q08', number: 8, section: 2, type: 'text', label: '8. 내 제품을 가장 좋아할 사람은 누구인가요?' },
  {
    id: 'q09', number: 9, section: 2, type: 'choice',
    label: '9. 고객은 왜 이 제품을 사고 싶어 할까요?',
    options: opts([['aesthetic', '예뻐서'], ['special', '특별해서'], ['self_reward', '나를 위해'], ['gift', '선물하려고'], ['memory', '추억을 간직하려고'], ['decor', '공간을 꾸미려고'], ['unique_ownership', '나만의 것을 갖고 싶어서']]),
    layout: 'grid2', selection: 'multiple', // OPEN L4: selection mode / max not in source
  },
  {
    id: 'q10', number: 10, section: 2, type: 'choice',
    label: '10. 제품을 받은 고객이 어떤 기분을 느꼈으면 좋겠나요?\n*최대 3개 선택',
    options: EMOTIONS, layout: 'grid3', selection: 'multiple', maxSelection: 3,
  },
  {
    id: 'q11', number: 11, section: 2, type: 'choice',
    label: '11. 우리 브랜드를 표현하는 단어는 무엇인가요?\n*최대 3개 선택',
    options: EMOTIONS, layout: 'grid3', selection: 'multiple', maxSelection: 3, // OPEN L3: identical to Q10 in source
  },
  { id: 'q12', number: 12, section: 2, type: 'text', label: '12. 반대로, 이런 이미지는 피하고 싶다는 게 있나요?' },
  { id: 'q13', number: 13, section: 2, type: 'text', label: '13. 브랜드나 제품을 대표하는 상징이나 모티프가 있나요?', helperText: '예) 별 / 달 / 꽃 / 나무 / 강아지 / 고양이' },

  { id: 'q14', number: 14, section: 3, type: 'text', label: '14. 제품에서 가장 어필하고 싶은 것은 무엇인가요?' },
  { id: 'q15', number: 15, section: 3, type: 'text', label: '15. 사람들이 보면 신기해할 만한 제작 과정이 있나요?' },
  {
    id: 'q16', number: 16, section: 3, type: 'choice',
    label: '16. 지금 인스타그램에서 가장 어려운 점은 무엇인가요?\n*최대 3개 선택',
    options: opts([['low_views', '조회수가 안 나와요'], ['low_followers', '팔로워가 안 늘어요'], ['content_ideas', '어떤 콘텐츠를 만들지 모르겠어요'], ['filming', '촬영이 어려워요'], ['editing', '편집이 어려워요'], ['consistency', '꾸준히 올리기 어려워요'], ['low_conversion', '구매로 연결되지 않아요'], ['other', '기타']]),
    layout: 'full', selection: 'multiple', maxSelection: 3,
  },
  {
    id: 'q17', number: 17, section: 3, type: 'choice',
    label: '17. 지금 어떤 릴스를 주로 올리고 있나요?\n*최대 3개 선택',
    options: opts([['rarely_post', '거의 안 올려요'], ['finished_product', '완성품 위주'], ['making_process', '제작 과정 위주'], ['photo_video_mix', '사진/영상 혼합'], ['trend_reels', '트렌드 릴스'], ['vlog', '브이로그']]),
    layout: 'grid2', selection: 'multiple', maxSelection: 3,
  },
  {
    id: 'q18', number: 18, section: 3, type: 'choice',
    label: '18. 릴스에서 얼굴과 목소리를 공개할 수 있나요?',
    options: opts([['yes', '네'], ['no', '아니요'], ['face_only', '얼굴만'], ['voice_only', '목소리만']]),
    layout: 'grid2', selection: 'single', // OPEN L4
  },
  // Q19: absent in source (OPEN L1) — numbering kept as-is.
  { id: 'q20', number: 20, section: 3, type: 'text', label: '20. 릴스에서 꼭 보여주고 싶은 것이 있다면?' },
];

export const STEP_SECTIONS: Record<1 | 2 | 3, Question[]> = {
  1: QUESTIONS.filter((q) => q.section === 1),
  2: QUESTIONS.filter((q) => q.section === 2),
  3: QUESTIONS.filter((q) => q.section === 3),
};

// text question → verbatim user input; choice question → array of option codes.
export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;
