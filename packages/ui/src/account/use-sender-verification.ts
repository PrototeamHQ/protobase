import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { runVerification, type VerificationCalls, type VerificationState } from './verification-run'
import { text } from './messages'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * A From address verification for a dialog: `verify` runs it (`runVerification`), once at a time, and `state` and
 * `error` say where it stands. Unmounting stops it. With `auto`, it runs as soon as it mounts, as after adding an address.
 */
export const useSenderVerification = (calls: VerificationCalls, auto = false) => {
  const [state, setState] = useState<VerificationState>({ status: 'idle' })
  const [error, setError] = useState<string>()
  const running = useRef(false)
  const left = useRef(false)
  const latest = useRef(calls)
  latest.current = calls

  const verify = useCallback(async () => {
    if (running.current) return
    running.current = true
    setError(undefined)
    try {
      await runVerification({ ...latest.current, wait, stopped: () => left.current, onState: setState })
    } catch (failure) {
      if (left.current) return
      setState({ status: 'idle' })
      // The browser's fetch rejects with a TypeError when the connection fails, before or after the server acted.
      if (failure instanceof TypeError) return setError(text('noAnswerFromServer'))
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    } finally {
      running.current = false
    }
  }, [])

  useEffect(() => {
    left.current = false
    if (auto) void verify()
    return () => {
      left.current = true
    }
  }, [auto, verify])

  return { state, error, verify }
}
