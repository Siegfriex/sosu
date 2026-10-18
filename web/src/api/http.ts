// HTTP transport for contract V1.0 (POST multipart/form-data, one synchronous request per generation).
import { ANSWER_FIELDS, QUESTIONS, type Answers } from '../data/questions';
import type { PrescriptionReport, SurveyReport } from '../data/report';
import { adaptDiagnosis, adaptPrescription } from './adapters';
import type { DeliveryTicket, DiagnosisOptions, Generated, PrescriptionOptions } from './client';
import { CONTRACT_VERSION, INPUT_ERROR_CODES, LOCALE, type ErrorCode, type ErrorEnvelope, type FeaturesV1, type ReportEmailRequestV1, type SurveyAnswersV1, type SurveyDiagnosisRequestV1 } from './contract';
import { ApiError } from './errors';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
/** Client deadline: server model deadline is 180 s; give it headroom for upload + envelope. */
export const CLIENT_TIMEOUT_MS = 190_000;

/** Not statically known in http mode: the delivery screen asks GET /api/v1/features (emailEnabled) first. */
export const emailDelivery = false;
const FEATURES_TIMEOUT_MS = 8_000;
const EMAIL_TIMEOUT_MS = 30_000;

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

export interface ParsedSuccess { data: Record<string, unknown>; requestId: string | null; deliveryToken: string | null }

/** Parses a response body into the success `data` or throws a typed ApiError. Non-JSON / malformed ⇒ error, never success. */
export function parseEnvelope(status: number, text: string, sentRequestId?: string): unknown {
  return parseEnvelopeFull(status, text, sentRequestId).data;
}

/** As parseEnvelope, plus the envelope's request_id and optional delivery_token (non-string → null). */
export function parseEnvelopeFull(status: number, text: string, sentRequestId?: string): ParsedSuccess {
  let body: unknown;
  try { body = JSON.parse(text); } catch {
    // e.g. a proxy's HTML 504 page: still a timeout for the user, never a success.
    throw new ApiError(status === 504 ? 'timeout' : 'error', 'malformed response (not JSON)', { code: status === 504 ? 'MODEL_TIMEOUT' : 'MALFORMED_RESPONSE', retryable: true, httpStatus: status, requestId: sentRequestId });
  }
  if (isObj(body) && body.ok === true && status >= 200 && status < 300 && 'data' in body && isObj(body.data)) {
    const requestId = typeof body.request_id === 'string' ? body.request_id : (sentRequestId ?? null);
    const deliveryToken = typeof body.delivery_token === 'string' && body.delivery_token ? body.delivery_token : null;
    return { data: body.data, requestId, deliveryToken };
  }
  if (isObj(body) && body.ok === false && isObj(body.error) && typeof body.error.code === 'string') {
    const env = body as unknown as ErrorEnvelope;
    const code = env.error.code;
    const requestId = typeof env.request_id === 'string' ? env.request_id : sentRequestId;
    const init = { code, retryable: !!env.error.retryable, requestId, httpStatus: status };
    if ((INPUT_ERROR_CODES as readonly string[]).includes(code)) throw new ApiError('input', env.error.message || code, { ...init, retryable: false });
    if (code === 'MODEL_TIMEOUT') throw new ApiError('timeout', env.error.message || code, init);
    if (code === 'SERVICE_UNAVAILABLE') throw new ApiError('unavailable', env.error.message || code, { ...init, retryable: false });
    if (code === 'EMAIL_DELIVERY_FAILED') throw new ApiError('send-error', env.error.message || code, init);
    throw new ApiError('error', env.error.message || code, init);
  }
  throw new ApiError('error', 'malformed response envelope', { code: 'MALFORMED_RESPONSE', retryable: true, httpStatus: status, requestId: sentRequestId });
}

async function post(path: string, form: FormData | string, signal?: AbortSignal, timeoutMs = CLIENT_TIMEOUT_MS): Promise<ParsedSuccess> {
  const requestId = newRequestId();
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let res: Response;
    try {
      // multipart: Content-Type is left to the browser (boundary). string body = JSON.
      const headers: Record<string, string> = { 'X-Request-ID': requestId };
      if (typeof form === 'string') headers['Content-Type'] = 'application/json';
      res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: form, headers, signal: ctrl.signal });
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
    return parseEnvelopeFull(res.status, text, res.headers.get('X-Request-ID') ?? requestId);
  } catch (e) {
    // Correlation id only — never request contents.
    if (e instanceof ApiError) console.warn(`[sosu] ${path} failed: code=${e.code ?? e.kind} request_id=${e.requestId ?? requestId}`);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const ticket = (kind: DeliveryTicket['kind'], r: ParsedSuccess): DeliveryTicket | null =>
  (r.requestId ? { kind, report: r.data, requestId: r.requestId, token: r.deliveryToken } : null);

export async function generateDiagnosis(answers: Answers, opts: DiagnosisOptions = {}): Promise<Generated<SurveyReport>> {
  const form = new FormData();
  form.append('payload', JSON.stringify(buildDiagnosisRequest(answers)));
  if (opts.productImage) form.append('product_image', opts.productImage, opts.productImage.name);
  const r = await post('/api/v1/diagnosis', form, opts.signal);
  return { report: adaptDiagnosis(r.data), delivery: ticket('diagnosis', r) };
}

export async function generatePrescription(url: string, opts: PrescriptionOptions): Promise<Generated<PrescriptionReport>> {
  const form = new FormData();
  form.append('payload', JSON.stringify({ contract_version: CONTRACT_VERSION, locale: LOCALE, instagram_url: url.trim() }));
  for (const f of opts.insightImages) form.append('insight_images', f, f.name);
  const r = await post('/api/v1/prescription', form, opts.signal);
  return { report: adaptPrescription(r.data), delivery: ticket('prescription', r) };
}

/** GET /api/v1/features (not enveloped). Throws on network / non-2xx / non-JSON. */
export async function getFeatures(signal?: AbortSignal): Promise<FeaturesV1> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEATURES_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/features`, { signal: ctrl.signal });
    if (!res.ok) throw new ApiError('error', `features HTTP ${res.status}`, { httpStatus: res.status });
    const body: unknown = await res.json();
    if (!isObj(body)) throw new ApiError('error', 'features: malformed');
    return body as FeaturesV1;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

/** true only when the backend explicitly reports email.enabled === true. Unknown / failure → false. */
export async function emailEnabled(): Promise<boolean> {
  try { return (await getFeatures()).email?.enabled === true; } catch { return false; }
}

/** POST /api/v1/report-email. 'sent' and 'duplicate' both resolve. SERVICE_UNAVAILABLE → ApiError('unavailable'); everything else → 'send-error'. */
export async function sendReportEmail(email: string, t?: DeliveryTicket | null): Promise<void> {
  if (!t?.token) throw new ApiError('unavailable', 'no delivery token for this report', { retryable: false });
  const body: ReportEmailRequestV1 = { kind: t.kind, report: t.report, request_id: t.requestId, delivery_token: t.token, email: email.trim() };
  try {
    const r = await post('/api/v1/report-email', JSON.stringify(body), undefined, EMAIL_TIMEOUT_MS);
    const status = r.data.status;
    if (status !== 'sent' && status !== 'duplicate') throw new ApiError('send-error', `unexpected email status: ${String(status)}`, { code: 'MALFORMED_RESPONSE' });
  } catch (e) {
    if (e instanceof ApiError && (e.kind === 'unavailable' || e.kind === 'send-error')) throw e;
    if (e instanceof ApiError) throw new ApiError('send-error', e.message, { code: e.code, retryable: e.retryable, requestId: e.requestId, httpStatus: e.httpStatus });
    throw e;
  }
}

export type { ErrorCode };
