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

export interface SosuApi {
  generateDiagnosis(answers: Answers, opts?: DiagnosisOptions): Promise<SurveyReport>;
  generatePrescription(url: string, opts: PrescriptionOptions): Promise<PrescriptionReport>;
  /** false → no backend endpoint; the delivery screen shows an honest "unavailable" state. */
  readonly emailDelivery: boolean;
  sendReportEmail(email: string): Promise<void>;
}

export type ApiMode = 'http' | 'mock';
export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'http';

export const api: SosuApi = API_MODE === 'mock' ? mock : http;
