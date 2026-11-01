// Response adapter: contract V1.0 report `data` → ReportViewModel (data/report.ts).
// Structured items are flattened into the VM's display strings without dropping meaningful content:
//   positioning.summary → positioning, positioning.rationale → positioningRationale
//   strengths[] → "① title — description" lines; target → summary + description
//   tone → keywords line + description; fonts.reason → fonts.reason
//   priorities (sorted by rank) / reel_types → "title — description" / "name — reason" (+ reelAxes/reelCombo from 유형 A~F names)
//   structure keys hook_0_3 … cta_27_30 → 0~3초 … 27~30초; final_guidance[] → numbered lines
//   prescription → summary + diagnosis; next_actions (sorted by order) → "title — description"
// guidebookNote is a fixed UI note shown only for guidebook reel types (유형 A~F names), never model text. Shape violations throw ApiError('error').
import type { PrescriptionReport, SurveyReport } from '../data/report';
import type { DiagnosisReportV1, PrescriptionReportV1 } from './contract';
import { ApiError } from './errors';
import { GUIDEBOOK_REEL_NOTE } from '../data/evidence';

const fail = (what: string): never => { throw new ApiError('error', `malformed report: ${what}`, { code: 'MALFORMED_RESPONSE', retryable: true }); };
const str = (v: unknown, what: string): string => (typeof v === 'string' ? v : fail(what));
const obj = (v: unknown, what: string): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(what));
const arr = (v: unknown, what: string, min = 0): unknown[] => (Array.isArray(v) && v.length >= min ? v : fail(what));
const strs = (v: unknown, what: string): string[] => arr(v, what).map((x, i) => str(x, `${what}[${i}]`));
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const joinTD = (title: string, desc: string) => (desc ? `${title} — ${desc}` : title);

// Guidebook reel types (SOSU_py app/domain/reel_types.py): names are fixed labels "유형 X · …",
// one per axis — 순서 A/B, 사운드 C/D, 자막 E/F. Older free-text names fall back to "유형 N".
const REEL_AXIS: Record<string, string> = { A: '순서', B: '순서', C: '사운드', D: '사운드', E: '자막', F: '자막' };
export function reelGuide(names: string[]): { axes: [string, string, string]; combo: string } | null {
  const codes = names.map((n) => /^유형 ([A-F]) · /.exec(n)?.[1]);
  if (codes.length !== 3 || codes.some((c) => !c)) return null;
  // Caption axis reads '자막·나레이션' (guidebook 2-3) unless the label is the voice-free variant (Q18).
  const axes = codes.map((c, i) => (REEL_AXIS[c as string] === '자막' && names[i].includes('나레이션') ? '자막·나레이션' : REEL_AXIS[c as string]));
  if (new Set(axes.map((a) => a.slice(0, 2))).size !== 3) return null;
  if (codes.join('') !== [...(codes as string[])].sort().join('')) return null; // server emits axis order 순서→사운드→자막
  return { axes: axes as [string, string, string], combo: (codes as string[]).join('+') };
}

export const STRUCTURE_KEYS: [keyof DiagnosisReportV1['structure'], string][] = [
  ['hook_0_3', '0~3초'], ['body_3_10', '3~10초'], ['body_10_20', '10~20초'], ['close_20_27', '20~27초'], ['cta_27_30', '27~30초'],
];

export function adaptDiagnosis(raw: unknown): SurveyReport {
  const d = obj(raw, 'data') as unknown as Record<string, unknown>;
  const brand = obj(d.brand, 'brand');
  const positioning = obj(d.positioning, 'positioning');
  const target = obj(d.target, 'target');
  const tone = obj(d.tone, 'tone');
  const fonts = obj(d.fonts, 'fonts');
  const structure = obj(d.structure, 'structure');
  const strengths = arr(d.strengths, 'strengths', 1).map((x, i) => { const o = obj(x, `strengths[${i}]`); return `${CIRCLED[i] ?? `${i + 1}.`} ${joinTD(str(o.title, 'strength.title'), str(o.description, 'strength.description'))}`; });
  const priorities = arr(d.priorities, 'priorities', 3).map((x, i) => obj(x, `priorities[${i}]`))
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map((o) => joinTD(str(o.title, 'priority.title'), str(o.description, 'priority.description')));
  const reelItems = arr(d.reel_types, 'reel_types', 3).slice(0, 3).map((x, i) => obj(x, `reel_types[${i}]`));
  const reelTypes = reelItems.map((o) => joinTD(str(o.name, 'reel_type.name'), str(o.reason, 'reel_type.reason')));
  const guide = reelGuide(reelItems.map((o) => str(o.name, 'reel_type.name')));
  const toneKeywords = strs(tone.keywords, 'tone.keywords');
  return {
    brand: { name: str(brand.name, 'brand.name'), material: str(brand.material, 'brand.material'), product: str(brand.product, 'brand.product'), keywords: strs(brand.keywords, 'brand.keywords').join(', ') },
    positioning: str(positioning.summary, 'positioning.summary'),
    positioningRationale: str(positioning.rationale, 'positioning.rationale'),
    strengths: strengths.join('\n'),
    target: [str(target.summary, 'target.summary'), str(target.description, 'target.description')].filter(Boolean).join('\n'),
    tone: [toneKeywords.length ? toneKeywords.join(' · ') : '', str(tone.description, 'tone.description')].filter(Boolean).join('\n'),
    fonts: { title: str(fonts.title, 'fonts.title'), subtitle: str(fonts.subtitle, 'fonts.subtitle'), reason: str(fonts.reason, 'fonts.reason') },
    priorities: priorities.slice(0, 3) as [string, string, string],
    reelTypes: reelTypes.slice(0, 3) as [string, string, string],
    ...(guide ? { reelAxes: guide.axes, reelCombo: guide.combo, guidebookNote: GUIDEBOOK_REEL_NOTE } : {}),
    structure: STRUCTURE_KEYS.map(([k, range]) => ({ range, guide: str(structure[k], `structure.${k}`) })),
    finalGuidance: strs(d.final_guidance, 'final_guidance').map((g, i) => `${i + 1}. ${g}`).join('\n'),
  };
}

export function adaptPrescription(raw: unknown): PrescriptionReport {
  const d = obj(raw, 'data') as unknown as Partial<PrescriptionReportV1> & Record<string, unknown>;
  const body = obj(d.prescription, 'prescription');
  const tone = obj(d.tone, 'tone');
  const actions = arr(d.next_actions, 'next_actions', 1).map((x, i) => obj(x, `next_actions[${i}]`))
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((o) => joinTD(str(o.title, 'next_action.title'), str(o.description, 'next_action.description')));
  const kw = strs(tone.keywords, 'tone.keywords');
  return {
    prescription: [str(body.summary, 'prescription.summary'), str(body.diagnosis, 'prescription.diagnosis')].filter(Boolean).join('\n\n'),
    nextActions: actions,
    tone: [kw.length ? kw.join(' · ') : '', str(tone.description, 'tone.description')].filter(Boolean).join('\n'),
  };
}
