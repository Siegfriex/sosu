// Error taxonomy the screens react to. Transports (mock / http) map their failures onto these kinds.
//   timeout    — client deadline or MODEL_TIMEOUT → ERROR screen (retry)
//   error      — retryable server/model/network failure or INTERNAL_ERROR → ERROR screen (retry)
//   input      — non-retryable input error (INVALID_* / INSUFFICIENT_INPUT / IMAGE_TOO_LARGE) → back to the input screen
//   unavailable — SERVICE_UNAVAILABLE (503, retryable=false): AI generation / email is switched off by the owner → honest
//                 "준비 중" state, never an auto-retry loop
//   send-error — email delivery failure (EMAIL_DELIVERY_FAILED, rejected token, network) → delivery form error
import type { ErrorCode } from './contract';

export type ApiErrorKind = 'timeout' | 'error' | 'input' | 'send-error' | 'unavailable';

export interface ApiErrorInit { code?: ErrorCode | 'NETWORK' | 'MALFORMED_RESPONSE' | 'CLIENT_TIMEOUT'; retryable?: boolean; requestId?: string; httpStatus?: number }

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code?: ApiErrorInit['code'];
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly httpStatus?: number;
  constructor(kind: ApiErrorKind, message: string = kind, init: ApiErrorInit = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = init.code;
    this.retryable = init.retryable ?? (kind !== 'input' && kind !== 'unavailable');
    this.requestId = init.requestId;
    this.httpStatus = init.httpStatus;
  }
}

export const isAbortError = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

// 'rate-limited' = RATE_LIMITED (429, retryable): ERROR screen with "요청이 많아요" copy + manual retry.
export type GenerationErrorKind = 'timeout' | 'error' | 'unavailable' | 'rate-limited';
export function generationErrorKind(e: unknown): GenerationErrorKind {
  if (!(e instanceof ApiError)) return 'error';
  if (e.kind === 'timeout' || e.kind === 'unavailable') return e.kind;
  return e.code === 'RATE_LIMITED' ? 'rate-limited' : 'error';
}

export const isInputError = (e: unknown): e is ApiError => e instanceof ApiError && e.kind === 'input';

/** Actionable inline copy for a non-retryable input error (server message is the fallback). */
export function inputErrorMessage(e: ApiError, workflow: 'survey' | 'prescription'): string {
  switch (e.code) {
    case 'INSUFFICIENT_INPUT': return '문진 답변이나 제품 이미지 중 하나 이상이 필요해요. 답변을 입력하거나 이미지를 올려주세요.';
    case 'INVALID_IMAGE_TYPE': return 'jpg, png, webp 이미지만 업로드할 수 있어요. 파일을 확인해 주세요.';
    case 'IMAGE_TOO_LARGE': return '이미지 용량이 너무 커요. 더 작은 이미지로 다시 올려주세요.';
    case 'INVALID_IMAGE_COUNT': return workflow === 'survey' ? '제품 이미지는 1장까지 올릴 수 있어요.' : '인사이트 캡처 3장을 모두 올려주세요.';
    case 'INVALID_INSTAGRAM_URL': return '릴스 URL을 확인해 주세요. (예: https://www.instagram.com/reel/…)';
    case 'INVALID_REQUEST': return '입력 내용을 확인한 뒤 다시 시도해 주세요.';
    default: return e.message || '입력 내용을 확인해 주세요.';
  }
}
