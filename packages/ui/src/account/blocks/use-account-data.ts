import { useCallback, useEffect, useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../../auth/auth-messages'

/**
 * What an account block reads, `undefined` until it is in, with `reload` to read it again after a change so the block
 * shows what the server now has. A failure shows the server's reason, or `fallback`.
 */
export const useAccountData = <T,>(load: () => Promise<T>, fallback: string) => {
  const [data, setData] = useState<{ value: T }>()
  const [error, setError] = useState<string>()
  const reload = useCallback(() => {
    void load().then(
      (value) => setData({ value }),
      (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : fallback),
    )
  }, [load, fallback])
  useEffect(reload, [reload])
  return { data: data?.value, loaded: data !== undefined, error, reload }
}
