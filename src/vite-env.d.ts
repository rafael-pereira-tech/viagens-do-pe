/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Opt-in placeholders (local / e2e). Must stay unset on Pages. Never a secret. */
  readonly VITE_USE_STUBS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
