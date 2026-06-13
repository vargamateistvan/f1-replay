import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// State backed by a URL search param (works under HashRouter — the param lives in
// the hash, e.g. `#/telemetry?session=9472&lap=10`). Updates use `replace` so we
// don't flood the back-stack while scrubbing/selecting. Functional updates against
// `prev` mean several setters firing in one tick (e.g. set meeting + clear session)
// merge correctly instead of clobbering each other.

export function useNumberParam(
  key: string,
  fallback: number | null,
): readonly [number | null, (next: number | null) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const parsed = raw === null ? fallback : Number(raw)
  const value = parsed === null || Number.isNaN(parsed) ? fallback : parsed

  const setValue = useCallback(
    (next: number | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === null || Number.isNaN(next)) p.delete(key)
          else p.set(key, String(next))
          return p
        },
        { replace: true },
      )
    },
    [key, setParams],
  )

  return [value, setValue] as const
}

export function useStringParam<T extends string>(
  key: string,
  fallback: T,
): readonly [T, (next: T) => void] {
  const [params, setParams] = useSearchParams()
  const value = (params.get(key) as T | null) ?? fallback

  const setValue = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === fallback) p.delete(key)
          else p.set(key, next)
          return p
        },
        { replace: true },
      )
    },
    [key, fallback, setParams],
  )

  return [value, setValue] as const
}
