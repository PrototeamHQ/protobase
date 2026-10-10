import { useMemo, useRef } from 'react'
import { createAssistantClient } from '@protobase/client'
import { useApiToken } from '../auth/use-api-token'

/** A client of the backend at `url`, authenticated as the signed-in user; `undefined` until their token is there. */
export const useAssistantClient = (url: string) => {
  const token = useApiToken()
  const latest = useRef(token)
  latest.current = token
  const ready = token !== undefined
  return useMemo(() => (ready ? createAssistantClient({ url, token: () => latest.current }) : undefined), [url, ready])
}
