import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'

export interface QueryState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

/**
 * Minimal data-fetching hook: runs `fn` on mount and whenever `deps` change
 * (or `reload()` is called), aborting in-flight requests on cleanup.
 */
export function useQuery<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): QueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    fn(controller.signal)
      .then((result) => {
        if (active) {
          setData(result)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, err instanceof Error ? err.message : 'Unknown error'),
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { data, error, loading, reload }
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
