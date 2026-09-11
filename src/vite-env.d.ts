/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Must match Worker `READ_API_KEY`. Never a Supabase key. */
  readonly VITE_READ_API_KEY?: string
  /** @deprecated Use `VITE_READ_API_KEY`. */
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
