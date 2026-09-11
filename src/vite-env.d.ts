/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Pages alias for Worker `API_READ_SECRET` / `READ_API_KEY`. Sent as Bearer. */
  readonly VITE_API_TOKEN?: string
  /** Alias of `VITE_API_TOKEN`. Never a Supabase key. */
  readonly VITE_READ_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
