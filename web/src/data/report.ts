// ReportViewModel — UI model (06_Handoff §E). The AI schema is adapted into this shape;
// the adapter lives with the API layer, not in components.

export interface SurveyReport {
  brand: { name: string; material: string; product: string; keywords: string };
  positioning: string;
  positioningRationale?: string; // OPEN L6
  strengths: string;
  target: string;
  tone: string;
  fonts: { title: string; subtitle: string };
  priorities: [string, string, string];
  reelTypes: [string, string, string];
  guidebookNote: string;
  structure: { range: string; guide: string }[];
  finalGuidance: string; // OPEN L5: section title duplicated in source
}

export interface PrescriptionReport {
  prescription: string;
  nextActions: string[];
  tone: string;
}

export type StageIndex = 1 | 2 | 3 | 4;
export const STAGES: Record<StageIndex, string> = { 1: '입력 확인', 2: '이미지 분석', 3: '진단 생성', 4: '결과 정리' };
