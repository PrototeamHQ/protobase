import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'

/** Runs one change at a time and keeps the server's refusal, in words, for the form to show. */
export const useAction = () => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }
  return { busy, error, run, setError }
}
