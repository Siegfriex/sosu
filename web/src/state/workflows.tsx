// Two independent workflow slices (06_Handoff §H): survey / prescription.
// Persistence = memory + sessionStorage (file binaries stay in memory only).
// Loading stage is presentation-only (LoadingState) and is not part of workflow state.

import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { migrateAnswers, type Answers } from '../data/questions';
import { IMAGE_TYPE_RE } from '../api/contract';
import type { PrescriptionReport, SurveyReport } from '../data/report';
import { api, type DeliveryTicket } from '../api/client';
import type { GenerationErrorKind } from '../api/errors';

export type SurveyStatus = 'STEP_1' | 'STEP_2' | 'STEP_3' | 'UPLOAD' | 'GENERATING' | 'RESULT' | 'DELIVERY' | 'DELIVERED' | 'ERROR';
export type PrescriptionStatus = 'INPUT' | 'GENERATING' | 'RESULT' | 'DELIVERY' | 'DELIVERED' | 'ERROR';

export interface FileMeta { id: string; name: string; size: number; type: string; valid: boolean }

export interface SurveyState {
  status: SurveyStatus;
  answers: Answers;
  files: FileMeta[];
  result: SurveyReport | null;
  email: string;
  errorKind: GenerationErrorKind | null;
  /** http mode: what /report-email needs (raw contract data + request_id + delivery_token). null in mock / when unsigned. */
  delivery: DeliveryTicket | null;
  /** true once the email backend confirmed sent/duplicate — /delivered never shows otherwise in http mode. */
  sent: boolean;
  /** Actionable, non-retryable input problem shown inline (role=alert) on the input screen. */
  inputError: string | null;
}
export interface PrescriptionState {
  status: PrescriptionStatus;
  url: string;
  files: FileMeta[];
  result: PrescriptionReport | null;
  email: string;
  errorKind: GenerationErrorKind | null;
  /** http mode: what /report-email needs (raw contract data + request_id + delivery_token). null in mock / when unsigned. */
  delivery: DeliveryTicket | null;
  /** true once the email backend confirmed sent/duplicate — /delivered never shows otherwise in http mode. */
  sent: boolean;
  inputError: string | null;
}

export const initialSurvey: SurveyState = { status: 'STEP_1', answers: {}, files: [], result: null, email: '', errorKind: null, inputError: null, delivery: null, sent: false };
export const initialPrescription: PrescriptionState = { status: 'INPUT', url: '', files: [], result: null, email: '', errorKind: null, inputError: null, delivery: null, sent: false };

type Patch<S> = Partial<S>;
type Action<S> = { type: 'patch'; patch: Patch<S> } | { type: 'reset' };

function reducer<S>(initial: S) {
  return (state: S, action: Action<S>): S => (action.type === 'reset' ? initial : { ...state, ...action.patch });
}

// Storage keys are versioned: v2 stores choice answers as option codes (v1 stored Korean labels).
// Pre-contract v2 drafts may hold legacy codes (e.g. 'special'); they are migrated to contract codes on load
// (questions.ts migrateAnswers: legacy→contract map, unknown codes dropped, max selection enforced). Key unchanged.
export const SURVEY_KEY = 'sosu.survey.v2';
export const PRESCRIPTION_KEY = 'sosu.prescription.v2';

export const LOST_FILES_MESSAGE = '새로고침으로 업로드한 이미지가 사라졌어요. 이미지를 다시 업로드해 주세요.';

// In-memory "a generation was started from the UI" ticket (http mode). A page load that lands directly on a
// generating route (reload, restored tab) has no ticket and returns to the input step instead of re-sending, so a
// late response from the aborted request can never be applied. Cleared when the generation settles.
export const generationTicket = { survey: false, prescription: false };
export const INTERRUPTED_MESSAGE = '새로고침으로 요청이 중단됐어요. 버튼을 눌러 다시 시작해 주세요.';

// In-memory file registry (binaries are never persisted).
const fileRegistry = new Map<string, File>();
export const fileStore = {
  put(file: File): FileMeta {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    fileRegistry.set(id, file);
    const valid = IMAGE_TYPE_RE.test(file.type); // contract: jpeg / png / webp only
    return { id, name: file.name, size: file.size, type: file.type, valid };
  },
  get: (id: string) => fileRegistry.get(id),
  remove: (id: string) => { fileRegistry.delete(id); },
};

function usePersistedReducer<S>(key: string, initial: S) {
  const [state, dispatch] = useReducer(reducer(initial), initial, (init) => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return init;
      const parsed = JSON.parse(raw) as S & { status: string; files?: FileMeta[] };
      // Transient states never resume as-is: a reload during generating goes back to the input step.
      const files = (parsed.files ?? []).filter((f) => fileRegistry.has(f.id));
      const status = parsed.status === 'GENERATING' ? (key === SURVEY_KEY ? 'UPLOAD' : 'INPUT') : parsed.status;
      const extra: Record<string, unknown> = {};
      if (key === SURVEY_KEY) extra.answers = migrateAnswers((parsed as unknown as { answers?: Answers }).answers ?? {});
      // Binaries are memory-only: if a reload dropped files the user had chosen, say so on the input screen.
      if (files.length < (parsed.files ?? []).length && (status === 'UPLOAD' || status === 'INPUT' || status === 'ERROR')) extra.inputError = LOST_FILES_MESSAGE;
      return { ...init, ...parsed, ...extra, files, status } as S;
    } catch { return init; }
  });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* quota/private mode */ } }, [key, state]);
  return [state, dispatch] as const;
}

interface Ctx {
  survey: SurveyState; patchSurvey: (p: Patch<SurveyState>) => void; resetSurvey: () => void;
  prescription: PrescriptionState; patchPrescription: (p: Patch<PrescriptionState>) => void; resetPrescription: () => void;
}
const WorkflowContext = createContext<Ctx | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [survey, ds] = usePersistedReducer<SurveyState>(SURVEY_KEY, initialSurvey);
  const [prescription, dp] = usePersistedReducer<PrescriptionState>(PRESCRIPTION_KEY, initialPrescription);
  const value = useMemo<Ctx>(() => ({
    survey, patchSurvey: (patch) => ds({ type: 'patch', patch }), resetSurvey: () => { survey.files.forEach((f) => fileStore.remove(f.id)); ds({ type: 'reset' }); },
    prescription, patchPrescription: (patch) => dp({ type: 'patch', patch }), resetPrescription: () => { prescription.files.forEach((f) => fileStore.remove(f.id)); dp({ type: 'reset' }); },
  }), [survey, prescription]);
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflows() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflows outside WorkflowProvider');
  return ctx;
}

// status → route (05_Flows). Tabs navigate to the workflow's *current* state.
export const surveyRoute: Record<SurveyStatus, string> = {
  STEP_1: '/survey/step/1', STEP_2: '/survey/step/2', STEP_3: '/survey/step/3', UPLOAD: '/survey/upload',
  GENERATING: '/survey/generating', RESULT: '/survey/result', DELIVERY: '/survey/delivery', DELIVERED: '/survey/delivered', ERROR: '/survey/error',
};
export const prescriptionRoute: Record<PrescriptionStatus, string> = {
  INPUT: '/prescription', GENERATING: '/prescription/generating', RESULT: '/prescription/result',
  DELIVERY: '/prescription/delivery', DELIVERED: '/prescription/delivered', ERROR: '/prescription/error',
};

/** Email delivery availability for the delivery screen.
 *  mock → always 'available'. http → 'checking' until GET /features answers; 'available' only when email.enabled and this
 *  report carries a delivery_token; anything else (disabled, unknown, fetch failure, no token) → 'unavailable'. */
export type EmailAvailability = 'checking' | 'available' | 'unavailable';
export function useEmailAvailability(ticket: DeliveryTicket | null): [EmailAvailability, (a: EmailAvailability) => void] {
  const hasToken = !!ticket?.token;
  const [state, setState] = useState<EmailAvailability>(api.emailDelivery ? 'available' : hasToken ? 'checking' : 'unavailable');
  useEffect(() => {
    if (api.emailDelivery || !hasToken) return;
    let live = true;
    api.emailEnabled().then((on) => { if (live) setState(on ? 'available' : 'unavailable'); });
    return () => { live = false; };
  }, [hasToken]);
  return [state, setState];
}
