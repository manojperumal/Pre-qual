import { useCallback, useEffect, useRef, useState } from 'react'

/** Minimal data-loading hook with optional polling (used for near-real-time views, FR-15/FR-18). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const reload = useCallback(async () => {
    try {
      const d = await fnRef.current()
      setData(d)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    reload()
    if (!pollMs) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, pollMs)
    return () => clearInterval(t)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload, setData }
}
