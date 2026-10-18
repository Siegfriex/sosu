// HTTP transport for contract V1.0 (POST multipart/form-data, one synchronous request per generation).
import { ANSWER_FIELDS, QUESTIONS, type Answers } from '../data/questions';
import type { PrescriptionReport, SurveyReport } from '../data/report';
import { adaptDiagnosis, adaptPrescription } from './adapters';
import type { DiagnosisOptions, PrescriptionOptions } from './client';
import { CONTRACT_VERSION, INPUT_ERROR_CODES, LOCALE, type ErrorCode, type ErrorEnvelope, type SurveyAnswersV1, type SurveyDiagnosisRequestV1 } from './contract';
import { ApiError } from './errors';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
/** Client deadline: server model deadline is 180 s; give it headroom for upload + envelope. */
export const CLIENT_TIMEOUT_MS = 190_000;

export const emailDelivery = false;

/** X-Request-ID: ≤64 chars of [A-Za-z0-9._-]. */
export function newRequestId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web-${rand}`.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
}

/** Survey state (q01…, choice = code arrays) → SurveyAnswersV1. Empty text → omitted; Q18 → single code or null. */
export function toSurveyAnswers(answers: Answers): SurveyAnswersV1 {
  const out: Record<string, unknown> = {};
  for (const q of QUESTIONS) {
    const field = ANSWER_FIELDS[q.id as keyof typeof ANSWER_FIELDS];
    const v = answers[q.id];
    if (!field) continue;
    if (q.type === 'text') { if (typeof v === 'string' && v.trim()) out[field] = v; continue; }
    const codes = Array.isArray(v) ? v : [];
    if (q.selection === 'single') out[field] = codes[0] ?? null;
    else if (codes.length) out[field] = codes;
  }
  return out as SurveyAnswersV1;
}

export function buildDiagnosisRequest(answers: Answers): SurveyDiagnosisRequestV1 {
  return { contract_version: CONTRACT_VERSION, locale: LOCALE, answers: toSurveyAnswers(answers) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses a response body into the success `data` or throws a typed ApiError. Non-JSON / malformed ⇒ error, never success. */
export function parseEnvelope(status: number, text: string, sentRequestId?: string): unknown {
  let body: unknown;
  try { body = JSON.parse(text); } catch {
    // e.g. a proxy's HTML 504 page: still a timeout for the user, never a success.
    throw new ApiError(status === 504 ? 'timeout' : 'error', 'malformed response (not JSON)', { code: status === 504 ? 'MODEL_TIMEOUT' : 'MALFORMED_RESPONSE', retryable: true, httpStatus: status, requestId: sentRequestId });
  }
  if (isObj(body) && body.ok === true && status >= 200 && status < 300 && 'data' in body && isObj(body.data)) {
    return body.data;
  }
  if (isObj(body) && body.ok === false && isObj(body.error) && typeof body.error.code === 'string') {
    const env = body as unknown as ErrorEnvelope;
    const code = env.error.code;
    const requestId = typeof env.request_id === 'string' ? env.request_id : sentRequestId;
    const init = { code, retryable: !!env.error.retryable, requestId, httpStatus: status };
    if ((INPUT_ERROR_CODES as readonly string[]).includes(code)) throw new ApiError('input', env.error.message || code, { ...init, retryable: false });
    if (code === 'MODEL_TIMEOUT') throw new ApiError('timeout', env.error.message || code, init);
    throw new ApiError('error', env.error.message || code, init);
  }
  throw new ApiError('error', 'malformed response envelope', { code: 'MALFORMED_RESPONSE', retryable: true, httpStatus: status, requestId: sentRequestId });
}

async function post(path: string, form: FormData, signal?: AbortSignal): Promise<unknown> {
  const requestId = newRequestId();
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, CLIENT_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let res: Response;
    try {
      // Content-Type is left to the browser (multipart boundary).
      res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: form, headers: { 'X-Request-ID': requestId }, signal: ctrl.signal });
    } catch (e) {
      if (timedOut) throw new ApiError('timeout', 'client timeout', { code: 'CLIENT_TIMEOUT', retryable: true, requestId });
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); // user cancellation / unmount
      throw new ApiError('error', e instanceof Error ? e.message : 'network error', { code: 'NETWORK', retryable: true, requestId });
    }
    let text: string;
    try { text = await res.text(); } catch {
      if (timedOut) throw new ApiError('timeout', 'client timeout', { code: 'CLIENT_TIMEOUT', retryable: true, requestId });
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      throw new ApiError('error', 'network error while reading body', { code: 'NETWORK', retryable: true, requestId, httpStatus: res.status });
    }
    return parseEnvelope(res.status, text, res.headers.get('X-Request-ID') ?? requestId);
  } catch (e) {
    // Correlation id only — never request contents.
    if (e instanceof ApiError) console.warn(`[sosu] ${path} failed: code=${e.code ?? e.kind} request_id=${e.requestId ?? requestId}`);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function generateDiagnosis(answers: Answers, opts: DiagnosisOptions = {}): Promise<SurveyReport> {
  const form = new FormData();
  form.append('payload', JSON.stringify(buildDiagnosisRequest(answers)));
  if (opts.productImage) form.append('product_image', opts.productImage, opts.productImage.name);
  return adaptDiagnosis(await post('/api/v1/diagnosis', form, opts.signal));
}

export async function generatePrescription(url: string, opts: PrescriptionOptions): Promise<PrescriptionReport> {
  const form = new FormData();
  form.append('payload', JSON.stringify({ contract_version: CONTRACT_VERSION, locale: LOCALE, instagram_url: url.trim() }));
  for (const f of opts.insightImages) form.append('insight_images', f, f.name);
  return adaptPrescription(await post('/api/v1/prescription', form, opts.signal));
}

export async function sendReportEmail(): Promise<void> {
  throw new ApiError('send-error', 'email delivery is not available (no backend endpoint)');
}

export type { ErrorCode };
