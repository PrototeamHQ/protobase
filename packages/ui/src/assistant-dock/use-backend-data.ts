import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { AssistantClient } from '@protobase/client'

/** The assistant backend the dock talks to, for the widgets it draws; `AssistantDock` provides it from its `client`. */
export const AssistantBackendContext = createContext<AssistantClient | undefined>(undefined)

/** How long to wait before reading again: a number of milliseconds while the data can still change, `false` once it cannot. */
export type BackendRefresh<T> = number | false | ((data: T | undefined) => number | false)

export type BackendData<T> = {
  /** The last answer read or posted; `undefined` until the first one. */
  data?: T
  /** Why the last read or post failed, such as an `ApiError` with the backend's detail; cleared by the next success. */
  error?: Error
  /** Reads again now. */
  reload: () => void
  /** Posts `body` as JSON to `path` on the backend; its answer replaces `data`. */
  post: (path: string, body?: unknown) => Promise<void>
}

const asError = (reason: unknown) => (reason instanceof Error ? reason : new Error('The assistant backend did not answer'))

const refreshOf = <T>(refresh: BackendRefresh<T>, data: T | undefined) => (typeof refresh === 'function' ? refresh(data) : refresh)

/**
 * JSON from the assistant backend at `path` (see `AssistantClient.fetch`), read as the signed-in user each time the
 * widget mounts, so a widget in an old chat shows the data as it is now; with `refreshMs`, read again while it can
 * still change. Only inside the dock, which provides the backend.
 */
export const useBackendData = <T = unknown>(path: string, { refreshMs = false }: { refreshMs?: BackendRefresh<T> } = {}): BackendData<T> => {
  const client = useContext(AssistantBackendContext)
  const [state, setState] = useState<{ data?: T; error?: Error }>({})
  const [reads, setReads] = useState(0)
  const refresh = useRef(refreshMs)
  refresh.current = refreshMs
  const latest = useRef<T>(undefined)

  useEffect(() => {
    if (!client) {
      setState({ error: new Error('useBackendData works only in a widget the assistant dock draws') })
      return
    }
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      const answer = await client.fetch(path).then((response) => response.json() as Promise<T>).then(
        (data) => ({ data }),
        (reason: unknown) => ({ data: latest.current, error: asError(reason) }),
      )
      if (!active) return
      latest.current = answer.data
      setState(answer)
      const wait = refreshOf(refresh.current, answer.data)
      if (wait !== false) timer = setTimeout(read, wait)
    }
    void read()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [client, path, reads])

  return {
    ...state,
    reload: () => setReads((count) => count + 1),
    post: async (to, body) => {
      if (!client) throw new Error('useBackendData works only in a widget the assistant dock draws')
      const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }
      const answer = await client.fetch(to, init).then((response) => response.json() as Promise<T>).then(
        (data) => ({ data }),
        (reason: unknown) => ({ data: latest.current, error: asError(reason) }),
      )
      latest.current = answer.data
      setState(answer)
    },
  }
}
