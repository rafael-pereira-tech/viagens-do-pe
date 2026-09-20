/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional local origin. Unused on Pages (same-origin Functions). Never a secret. */
  readonly VITE_API_URL?: string
  /** Opt-in placeholders (local / e2e). Must stay unset on Pages. */
  readonly VITE_USE_STUBS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
