import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../../auth/auth-messages'

/**
 * What an account block reads, `undefined` until it is in, with `reload` to read it again after a change so the block
 * shows what the server now has. A failure shows the server's reason, or `fallback`, until a later read succeeds; a
 * read that a newer one overtook is ignored.
 */
export const useAccountData = <T,>(load: () => Promise<T>, fallback: string) => {
  const [data, setData] = useState<{ value: T }>()
  const [error, setError] = useState<string>()
  // Only the latest read counts: an older one that answers last never replaces what a newer one found.
  const latest = useRef(0)
  const reload = useCallback(() => {
    const read = ++latest.current
    void load().then(
      (value) => {
        if (read !== latest.current) return
        setData({ value })
        setError(undefined)
      },
      (failure: unknown) => {
        if (read !== latest.current) return
        setError(failure instanceof AuthError ? authMessage(failure) : fallback)
      },
    )
  }, [load, fallback])
  useEffect(reload, [reload])
  return { data: data?.value, loaded: data !== undefined, error, reload }
}
