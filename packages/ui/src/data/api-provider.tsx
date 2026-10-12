import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient, type Client, type ClientOptions, type SourceRef } from '@protobase/client'
import { keys } from './query-keys'

const ApiContext = createContext<Client | null>(null)
const SourceClientsContext = createContext<((source: SourceRef) => Client) | null>(null)
const ResourceClientContext = createContext<((resource: string) => Client | undefined) | null>(null)

/** The API client: the app's own, or below `MetaGate` one that sends each resource's calls to the API that serves it. */
export const useClient = () => {
  const client = useContext(ApiContext)
  if (!client) throw new Error('useClient must be used inside ApiProvider')
  return client
}

/**
 * The client of the API that serves `resource`: a source's for a resource the app draws from one, the app's own
 * otherwise. A source's client calls that API's functions with `invoke`, where `useClient()` calls the app's own.
 */
export const useResourceClient = (resource: string) => {
  const own = useClient()
  return useContext(ResourceClientContext)?.(resource) ?? own
}

/** The client of a source's API, one per URL, with the signed-in user's token; for `MetaGate`. */
export const useSourceClients = () => {
  const clientOf = useContext(SourceClientsContext)
  if (!clientOf) throw new Error('useSourceClients must be used inside ApiProvider')
  return clientOf
}

/** Gives what is below it `client` from `useClient()`, and the client of a resource's API from `useResourceClient()`. */
export const ClientProvider = ({ client, resourceClient, children }: { client: Client; resourceClient: (resource: string) => Client | undefined; children: ReactNode }) => (
  <ApiContext.Provider value={client}>
    <ResourceClientContext.Provider value={resourceClient}>{children}</ResourceClientContext.Provider>
  </ApiContext.Provider>
)

export type ApiProviderProps = {
  /** Defaults to `/api/v1` on the current origin. */
  baseUrl?: string
  /** A ready-made client, for tests; skips the meta-version watcher. */
  client?: Client
  /** Ready-made clients of the sources `/meta` names, by their URL, for stories and tests. */
  sources?: Record<string, Client>
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
export const ApiProvider = ({ baseUrl, client: given, sources, fetch, queryClient: givenQueryClient, token, onUnauthenticated, children }: ApiProviderProps) => {
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
  // A source's client sends the user's token, and refetches the source's `/meta` when its version moves. A 401 there
  // does not sign the user out of the app: it is that API's answer, which the source's resources show.
  const sourceClient = useMemo(() => {
    const made = new Map<string, Client>()
    return (source: SourceRef) => {
      const ready = sources?.[source.url] ?? made.get(source.url)
      if (ready) return ready
      let seen: string | undefined
      const client = createClient({
        baseUrl: source.url,
        fetch,
        token,
        onMetaVersion: (version) => {
          const previous = seen
          seen = version
          if (previous === undefined || previous === version) return
          void queryClient.invalidateQueries({ queryKey: keys.sourceMetas(source.url) }, { cancelRefetch: false })
        },
      })
      made.set(source.url, client)
      return client
    }
  }, [sources, fetch, token, queryClient])
  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={client}>
        <SourceClientsContext.Provider value={sourceClient}>{children}</SourceClientsContext.Provider>
      </ApiContext.Provider>
    </QueryClientProvider>
  )
}
