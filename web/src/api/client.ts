// Boundary between screens and the AI service.
// Contract authority (when it lands): /contracts/01_DOMAIN_CONTRACT.md · 02_openapi.json · 03_CONTRACT_FIXTURES.json.
// No schema is duplicated here; request/response types will be generated from 02_openapi.json.
// Until then `api` is the mock. Screens import only from this module, never from mock.ts.

import type { Answers } from '../data/questions';
import type { PrescriptionReport, SurveyReport } from '../data/report';
import * as mock from './mock';

export interface RequestOptions { signal?: AbortSignal }

export interface SosuApi {
  generateDiagnosis(answers: Answers, opts?: RequestOptions): Promise<SurveyReport>;
  generatePrescription(url: string, opts?: RequestOptions): Promise<PrescriptionReport>;
  sendReportEmail(email: string): Promise<void>;
}

export const api: SosuApi = mock;
