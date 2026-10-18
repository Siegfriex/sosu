/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'http' (default when unset) | 'mock' (explicit, legacy e2e / design QA). */
  readonly VITE_API_MODE?: 'http' | 'mock';
  /** FastAPI origin, default http://127.0.0.1:8000. */
  readonly VITE_API_BASE_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
