import { createAuthSession, createClient, routedClient, sourceMeta, type AuthSession, type Client, type SourceMeta, type SourceRef } from '@protobase/client'

/** What the admin app does with its sources, as plain calls: its own `/meta`, each source's scoped to what it draws, and one client over all. */
type Sources = {
  /** The sources the app's `/meta` names, read with the page's session. */
  declared: () => Promise<SourceRef[]>
  /** A source's `/meta` read from that API with the app's token, scoped to the resources the app draws from it. */
  meta: (source: SourceRef) => Promise<SourceMeta>
  /** The app's client that sends each drawn resource's calls to its source. */
  client: () => Promise<Client>
}

declare global {
  interface Window {
    /** The page's sign-in session against the origin it was loaded from. */
    auth: AuthSession
    sources: Sources
  }
}

window.auth = createAuthSession()
const own = createClient({ token: window.auth.token })
const clientOf = (source: SourceRef) => createClient({ baseUrl: source.url, token: window.auth.token })
const declared = async () => {
  const result = await own.meta()
  return result.status === 'modified' ? (result.meta.sources ?? []) : []
}

window.sources = {
  declared,
  meta: async (source) => {
    const result = await clientOf(source).meta()
    if (result.status !== 'modified') throw new Error('A first read of /meta answered 304')
    return sourceMeta(result.meta, source)
  },
  client: async () => {
    const byResource = new Map((await declared()).flatMap((source) => source.resources.map((resource) => [resource, clientOf(source)] as const)))
    return routedClient(own, (resource) => byResource.get(resource))
  },
}
