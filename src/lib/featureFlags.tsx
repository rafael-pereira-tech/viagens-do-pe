import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Registry of UI feature flags (QP → localStorage). */
export const FEATURE_FLAGS = {
  playground: {
    key: 'vdpe-ff-playground',
    param: 'playground',
  },
} as const

export type FeatureFlagId = keyof typeof FEATURE_FLAGS

type FlagState = Record<FeatureFlagId, boolean>

type FeatureFlagsApi = FlagState & {
  anyActive: boolean
  clearAll: () => void
}

const FeatureFlagsContext = createContext<FeatureFlagsApi | null>(null)

function readStored(id: FeatureFlagId): boolean {
  try {
    return localStorage.getItem(FEATURE_FLAGS[id].key) === '1'
  } catch {
    return false
  }
}

function writeStored(id: FeatureFlagId, enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(FEATURE_FLAGS[id].key, '1')
    else localStorage.removeItem(FEATURE_FLAGS[id].key)
  } catch {
    /* ignore */
  }
}

function readAllStored(): FlagState {
  return { playground: readStored('playground') }
}

function parseQp(value: string | null): boolean | null {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return null
}

/** Merge localStorage with any QP overrides (sync, for first paint). */
function resolveFlags(params: URLSearchParams, stored: FlagState): FlagState {
  const next = { ...stored }
  for (const id of Object.keys(FEATURE_FLAGS) as FeatureFlagId[]) {
    const parsed = parseQp(params.get(FEATURE_FLAGS[id].param))
    if (parsed !== null) next[id] = parsed
  }
  return next
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [params, setSearchParams] = useSearchParams()
  const [stored, setStored] = useState(readAllStored)

  const flags = useMemo(() => resolveFlags(params, stored), [params, stored])

  // Persist QP → localStorage, then strip params from the URL.
  useEffect(() => {
    let touched = false
    const nextParams = new URLSearchParams(params)

    for (const id of Object.keys(FEATURE_FLAGS) as FeatureFlagId[]) {
      const { param } = FEATURE_FLAGS[id]
      const parsed = parseQp(params.get(param))
      if (parsed === null) continue
      writeStored(id, parsed)
      nextParams.delete(param)
      touched = true
    }

    if (!touched) return
    setStored(readAllStored())
    setSearchParams(nextParams, { replace: true })
  }, [params, setSearchParams])

  const clearAll = useCallback(() => {
    for (const id of Object.keys(FEATURE_FLAGS) as FeatureFlagId[]) {
      writeStored(id, false)
    }
    setStored(readAllStored())
  }, [])

  const value = useMemo<FeatureFlagsApi>(
    () => ({
      ...flags,
      anyActive: Object.values(flags).some(Boolean),
      clearAll,
    }),
    [flags, clearAll],
  )

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>
}

export function useFeatureFlags(): FeatureFlagsApi {
  const ctx = useContext(FeatureFlagsContext)
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagsProvider')
  return ctx
}

export const PLAYGROUND_FF_KEY = FEATURE_FLAGS.playground.key
export const PLAYGROUND_FF_PARAM = FEATURE_FLAGS.playground.param
