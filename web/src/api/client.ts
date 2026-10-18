// Boundary between screens and the AI service. Screens import only from this module.
// Contract authority: /contracts/01_DOMAIN_CONTRACT.md · 02_openapi.json (wire types: ./contract.ts).
// Runtime mode (build-time env, see web/.env.example):
//   VITE_API_MODE=http (default when unset) → real FastAPI at VITE_API_BASE_URL (default http://127.0.0.1:8000)
//   VITE_API_MODE=mock                      → in-browser mock (legacy e2e / design QA only)
// An HTTP failure never falls back to mock data.

import type { Answers } from '../data/questions';
import type { PrescriptionReport, SurveyReport } from '../data/report';
import * as http from './http';
import * as mock from './mock';

export interface RequestOptions { signal?: AbortSignal }
export interface DiagnosisOptions extends RequestOptions { productImage?: File | null }
export interface PrescriptionOptions extends RequestOptions { insightImages: File[] }

/** Everything POST /api/v1/report-email needs, captured from the generation's success envelope (sessionStorage-safe). */
export interface DeliveryTicket { kind: 'diagnosis' | 'prescription'; report: unknown; requestId: string; token: string | null }
export interface Generated<T> { report: T; delivery: DeliveryTicket | null }

export interface SosuApi {
  generateDiagnosis(answers: Answers, opts?: DiagnosisOptions): Promise<Generated<SurveyReport>>;
  generatePrescription(url: string, opts: PrescriptionOptions): Promise<Generated<PrescriptionReport>>;
  /** true → email delivery always offered (mock). false → only after GET /features says email.enabled and a token exists. */
  readonly emailDelivery: boolean;
  /** Resolves true only when the backend reports email.enabled (http). Any failure → false (honest "준비 중"). */
  emailEnabled(): Promise<boolean>;
  sendReportEmail(email: string, ticket?: DeliveryTicket | null): Promise<void>;
}

export type ApiMode = 'http' | 'mock';
export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'http';

export const api: SosuApi = API_MODE === 'mock' ? mock : http;
