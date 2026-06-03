/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly LLM_ADVISORY_TIMEOUT_MS?: string;
  readonly VITE_LLM_ADVISORY_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
