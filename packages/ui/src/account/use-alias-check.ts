import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { runAliasCheck, type AliasCheckCalls, type AliasCheckState } from './alias-check-run'
import { text } from './messages'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * A From address check for a dialog: `check` runs it (`runAliasCheck`), once at a time, and `state` and `error` say
 * where it stands. Unmounting stops it. With `auto`, it runs as soon as it mounts, as after adding an address.
 */
export const useAliasCheck = (calls: AliasCheckCalls, auto = false) => {
  const [state, setState] = useState<AliasCheckState>({ status: 'idle' })
  const [error, setError] = useState<string>()
  const running = useRef(false)
  const left = useRef(false)
  const latest = useRef(calls)
  latest.current = calls

  const check = useCallback(async () => {
    if (running.current) return
    running.current = true
    setError(undefined)
    try {
      await runAliasCheck({ ...latest.current, wait, stopped: () => left.current, onState: setState })
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
    if (auto) void check()
    return () => {
      left.current = true
    }
  }, [auto, check])

  return { state, error, check }
}
