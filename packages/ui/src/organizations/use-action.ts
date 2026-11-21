import { useState } from 'react'
import { AuthError, NetworkError } from '@protobase/client'
import { authMessage, unreachableMessage } from '../auth/auth-messages'

type ActionState = { setBusy: (busy: boolean) => void; setError: (error: string | undefined) => void }

/**
 * Runs `action`, busy until it ends however it ends. The server's refusal, or that it could not be reached, goes to
 * `setError` in words; any other failure is passed on.
 */
export const runAction = async (action: () => Promise<void>, { setBusy, setError }: ActionState) => {
  setBusy(true)
  setError(undefined)
  try {
    await action()
  } catch (failure) {
    if (failure instanceof AuthError) return setError(authMessage(failure))
    if (failure instanceof NetworkError) return setError(unreachableMessage())
    throw failure
  } finally {
    setBusy(false)
  }
}

/** Runs one change at a time and keeps why it failed, in words, for the form to show (`runAction`). */
export const useAction = () => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const run = (action: () => Promise<void>) => runAction(action, { setBusy, setError })
  return { busy, error, run, setError }
}
