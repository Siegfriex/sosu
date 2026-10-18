// Contract V1.0 wire types — hand-written from contracts/02_openapi.json / SOSU_py/app/contracts/*.py (read-only authority).
// Keep in sync with the Pydantic models: diagnosis.py (SurveyAnswersV1, DiagnosisReportV1), prescription.py, envelope.py.

export const CONTRACT_VERSION = '1.0' as const;
export const LOCALE = 'ko-KR' as const;

export interface SurveyAnswersV1 {
  q1_brand_name?: string | null;
  q2_product_category?: string | null;
  q3_hero_product?: string | null;
  q4_materials?: string | null;
  q5_material_reason?: string | null;
  q6_product_appeals?: string[];
  q7_differentiation?: string | null;
  q8_target_customer?: string | null;
  q9_purchase_motives?: string[];
  q10_desired_emotions?: string[];
  q11_brand_attributes?: string[];
  q12_avoidance?: string | null;
  q13_motif?: string | null;
  q14_primary_message?: string | null;
  q15_interesting_process?: string | null;
  q16_pain_points?: string[];
  q17_current_formats?: string[];
  q18_disclosure?: string | null;
  q20_must_show?: string | null;
}
export type SurveyField = keyof SurveyAnswersV1;

export interface SurveyDiagnosisRequestV1 { contract_version: typeof CONTRACT_VERSION; locale: string; answers: SurveyAnswersV1 }
export interface PrescriptionRequestV1 { contract_version: typeof CONTRACT_VERSION; locale: string; instagram_url: string }

export interface DiagnosisReportV1 {
  schema_version: 'diagnosis.v1';
  brand: { name: string; material: string; product: string; keywords: string[] };
  positioning: { summary: string; rationale: string };
  strengths: { title: string; description: string }[];
  target: { summary: string; description: string };
  tone: { keywords: string[]; description: string };
  fonts: { title: string; subtitle: string; reason: string };
  priorities: { rank: 1 | 2 | 3; title: string; description: string }[];
  reel_types: { name: string; reason: string }[];
  structure: { hook_0_3: string; body_3_10: string; body_10_20: string; close_20_27: string; cta_27_30: string };
  final_guidance: string[];
}

export interface PrescriptionReportV1 {
  schema_version: 'prescription.v1';
  prescription: { summary: string; diagnosis: string };
  next_actions: { order: 1 | 2 | 3 | 4; title: string; description: string }[];
  tone: { keywords: string[]; description: string };
}

export type ErrorCode =
  | 'INVALID_REQUEST' | 'INSUFFICIENT_INPUT' | 'INVALID_IMAGE_TYPE' | 'IMAGE_TOO_LARGE' | 'INVALID_IMAGE_COUNT' | 'INVALID_INSTAGRAM_URL'
  | 'MODEL_TIMEOUT' | 'MODEL_PROVIDER_ERROR' | 'MODEL_SCHEMA_ERROR' | 'MODEL_CONTENT_ERROR' | 'REPAIR_FAILED' | 'INTERNAL_ERROR'
  // Phase 2 additive codes (SOSU_py/.sprint/CONTRACT_DELTA.md)
  | 'SERVICE_UNAVAILABLE' | 'EMAIL_DELIVERY_FAILED' | 'RATE_LIMITED';

export const INPUT_ERROR_CODES: readonly ErrorCode[] = ['INVALID_REQUEST', 'INSUFFICIENT_INPUT', 'INVALID_IMAGE_TYPE', 'IMAGE_TOO_LARGE', 'INVALID_IMAGE_COUNT', 'INVALID_INSTAGRAM_URL'];

/** delivery_token: opaque "<issued_at>.<hmac>" (null/absent when the server cannot sign) — echoed to /report-email. */
export interface SuccessEnvelope<T> { ok: true; request_id: string; contract_version: string; data: T; delivery_token?: string | null }

/** GET /api/v1/features (not enveloped). */
export interface FeatureFlag { enabled: boolean; reason?: string | null }
export interface FeaturesV1 { contract_version?: string; inference?: FeatureFlag; email?: FeatureFlag; image_storage?: FeatureFlag; research?: FeatureFlag; knowledge_version?: string; build?: string }
export interface ReportEmailRequestV1 { kind: 'diagnosis' | 'prescription'; report: unknown; request_id: string; delivery_token: string; email: string }
export interface ErrorEnvelope { ok: false; request_id: string; contract_version: string; error: { code: ErrorCode; message: string; retryable: boolean; details: unknown[] } }

// Upload rules (contracts/01 §1, app/images/types.py).
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const IMAGE_TYPE_RE = /^image\/(jpeg|png|webp)$/;
