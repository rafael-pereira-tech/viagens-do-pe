import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export const PLAYGROUND_FF_KEY = 'vdpe-ff-playground'
export const PLAYGROUND_FF_PARAM = 'playground'

function readStored(): boolean {
  try {
    return localStorage.getItem(PLAYGROUND_FF_KEY) === '1'
  } catch {
    return false
  }
}

function writeStored(enabled: boolean) {
  try {
    localStorage.setItem(PLAYGROUND_FF_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Persist + resolve playground FF from `?playground=1|0` or localStorage. */
export function usePlaygroundFf(): boolean {
  const [params] = useSearchParams()
  const q = params.get(PLAYGROUND_FF_PARAM)
  const [stored, setStored] = useState(readStored)

  useEffect(() => {
    if (q === '1' || q === 'true') {
      writeStored(true)
      setStored(true)
      return
    }
    if (q === '0' || q === 'false') {
      writeStored(false)
      setStored(false)
    }
  }, [q])

  if (q === '1' || q === 'true') return true
  if (q === '0' || q === 'false') return false
  return stored
}
