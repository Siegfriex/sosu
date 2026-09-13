// Error taxonomy the screens react to. The transport (mock now, real client later) maps its failures onto these kinds.
export type ApiErrorKind = 'timeout' | 'error' | 'send-error';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, message = kind) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

export const isAbortError = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export const generationErrorKind = (e: unknown): 'timeout' | 'error' => (e instanceof ApiError && e.kind === 'timeout' ? 'timeout' : 'error');
