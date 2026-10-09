import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient, type Client, type ClientOptions } from '@protobase/client'
import { keys } from './query-keys'

const ApiContext = createContext<Client | null>(null)

export const useClient = () => {
  const client = useContext(ApiContext)
  if (!client) throw new Error('useClient must be used inside ApiProvider')
  return client
}

export type ApiProviderProps = {
  /** Defaults to `/api/v1` on the current origin. */
  baseUrl?: string
  /** A ready-made client, for tests; skips the meta-version watcher. */
  client?: Client
  /** The `fetch` the built client uses, for tests that keep the meta-version watcher. */
  fetch?: ClientOptions['fetch']
  queryClient?: QueryClient
  /** The bearer token source, and what to do when the session is over; see `createAuthSession`. */
  token?: ClientOptions['token']
  onUnauthenticated?: () => void
  children: ReactNode
}

/**
 * Owns the query cache and the API client; refetches `/meta` whenever `X-Meta-Version` changes. The version is
 * compared only with the last one seen: it hashes the models and roles, while the `/meta` ETag hashes the whole
 * per-caller body, so the two never match.
 */
export const ApiProvider = ({ baseUrl, client: given, fetch, queryClient: givenQueryClient, token, onUnauthenticated, children }: ApiProviderProps) => {
  const [queryClient] = useState(() => givenQueryClient ?? new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } } }))
  const metaVersion = useRef<string | undefined>(undefined)
  const client = useMemo(
    () =>
      given ??
      createClient({
        baseUrl,
        fetch,
        token,
        onUnauthenticated,
        onMetaVersion: (version) => {
          const previous = metaVersion.current
          metaVersion.current = version
          if (previous === undefined || previous === version) return
          // An in-flight `/meta` refetch is reused, so a version that keeps moving costs one request, not a loop.
          void queryClient.invalidateQueries({ queryKey: keys.meta }, { cancelRefetch: false })
        },
      }),
    [given, baseUrl, fetch, queryClient, token, onUnauthenticated],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
    </QueryClientProvider>
  )
}
