import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRuntimeClient, type RuntimeClient, type RuntimeStatus } from '@protobase/client'
import { useApiToken } from '../../auth/use-api-token'
import { refreshMs } from './runtime-status'

/** A client of the runtime endpoint at `url`, authenticated as the signed-in user; `undefined` until their token is there. */
export const useRuntimeClient = (url: string) => {
  const token = useApiToken()
  const latest = useRef(token)
  latest.current = token
  const ready = token !== undefined
  return useMemo(() => (ready ? createRuntimeClient({ url, token: () => latest.current }) : undefined), [url, ready])
}

/**
 * The runtime's status, read on load and every half hour after (every few seconds while an update runs), and `update` to apply the latest version now.
 * `status` keeps the last answer when a later read fails, which `checkError` then holds; `error` is why "Update now" failed.
 */
export const useRuntimeStatus = (client: RuntimeClient | undefined) => {
  const [status, setStatus] = useState<RuntimeStatus>()
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<unknown>()
  const [checkError, setCheckError] = useState<unknown>()
  const updating = status?.updating ?? false

  useEffect(() => {
    if (!client) return
    let active = true
    const read = () =>
      client.status().then(
        (next) => {
          if (!active) return
          setStatus(next)
          setCheckError(undefined)
        },
        (reason: unknown) => active && setCheckError(reason),
      )
    void read()
    const timer = setInterval(() => void read(), refreshMs(updating))
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [client, updating])

  const update = useCallback(async () => {
    if (!client) return
    setRequesting(true)
    setError(undefined)
    await client.update().then(setStatus, setError)
    setRequesting(false)
  }, [client])

  return { status, update, requesting, error, checkError }
}
