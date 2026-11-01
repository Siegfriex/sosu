// Evidence footnotes for the diagnosis report.
// The model cites survey questions inline as "(q15, q20)". On screen those markers are removed from
// the body (owner decision D5-c) and each section gets a "근거 질문" footnote listing the question and,
// when the draft answers are still in memory, the user's own answer. Display-only: the contract and the
// signed report data are untouched. Mirror for e-mail: SOSU_py app/email/render.py (questions only).
import { QUESTIONS, type Answers } from './questions';

export const GUIDEBOOK_REEL_NOTE = "*릴스 유형은 가이드북 2장 '실전 릴스 유형' 참고";

// "(q15)", "(q4, q15)", "(Q14·q15)", "(문항 q15/20)" — a parenthesised group of q-numbers.
const GROUP_RE = /\s*[(（]\s*(?:문항\s*)?[qQ]\s*\d{1,2}(?:\s*[,，·/、]\s*(?:[qQ]\s*)?\d{1,2})*\s*[)）]/g;
const NUM_RE = /\d{1,2}/g;
// A bare "q17" left in prose becomes "17번 문항" so the sentence still reads.
const BARE_RE = /(?<![A-Za-z0-9])[qQ](\d{1,2})(?![0-9])/g;

const KNOWN = new Set(QUESTIONS.map((q) => q.number));

export interface Cited { text: string; refs: number[] }

export function stripRefs(text: string): Cited {
  const refs = new Set<number>();
  let out = text.replace(GROUP_RE, (m) => {
    const nums = (m.match(NUM_RE) ?? []).map(Number).filter((n) => KNOWN.has(n));
    if (!nums.length) return m; // not a survey reference (e.g. q99) — leave the text alone
    for (const n of nums) refs.add(n);
    return '';
  });
  out = out.replace(BARE_RE, (m, n: string) => {
    if (!KNOWN.has(Number(n))) return m;
    refs.add(Number(n));
    return `${Number(n)}번 문항`;
  });
  return { text: out, refs: [...refs] };
}

/** Strips every text of a section and returns the cleaned texts with the section's sorted, unique refs. */
export function citeSection(texts: string[]): { texts: string[]; refs: number[] } {
  const cited = texts.map(stripRefs);
  return { texts: cited.map((c) => c.text), refs: [...new Set(cited.flatMap((c) => c.refs))].sort((a, b) => a - b) };
}

/** "15. 사람들이 보면 신기해할 만한 제작 과정이 있나요?" → question sentence without number, hints or helper marks. */
export function questionText(n: number): string | null {
  const q = QUESTIONS.find((x) => x.number === n);
  if (!q) return null;
  return q.label.replace(/^\d+\.\s*/, '').split(/\n|\*/)[0].trim();
}

const MAX_ANSWER = 80;

/** The user's answer for question n as display text (choice codes → labels), or null when unknown. */
export function answerText(n: number, answers: Answers | undefined): string | null {
  const q = QUESTIONS.find((x) => x.number === n);
  const v = q && answers?.[q.id];
  if (!q || v == null) return null;
  let s: string;
  if (q.type === 'text') s = typeof v === 'string' ? v.trim() : '';
  else s = (Array.isArray(v) ? v : []).map((c) => q.options.find((o) => o.code === c)?.label ?? '').filter(Boolean).join(', ');
  if (!s) return null;
  return s.length > MAX_ANSWER ? `${s.slice(0, MAX_ANSWER)}…` : s;
}
