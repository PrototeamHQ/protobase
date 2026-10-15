import { useContext, useMemo, type ReactNode } from 'react'
import { isApiError, routedClient } from '@protobase/client'
import { ClientProvider, useClient, useSourceClients } from '../data/api-provider'
import { MetaContext } from '../data/meta-context'
import { allowEverything, type MetaData } from '../data/meta-data'
import { useMeta } from '../data/use-meta'
import { useSourceMetas } from '../data/use-source-metas'
import { withSources } from '../data/with-sources'
import { Spinner } from '../primitives/spinner'

export const useAdminMeta = () => {
  const meta = useContext(MetaContext)
  if (!meta) throw new Error('useAdminMeta must be used inside MetaGate')
  return meta
}

const Notice = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex h-full min-h-48 flex-1 items-center justify-center p-8">
    <div className="max-w-md text-center">
      <h1 className="text-[15px] font-semibold">{title}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{children}</p>
    </div>
  </div>
)

/**
 * Draws the resources of the app's sources as its own: reads each source's `/meta`, merges what is ready into the app's,
 * and gives what is below a client that sends each resource's calls to the API that serves it. The app does not wait
 * for a source; its resources join when it has loaded.
 */
const WithSources = ({ meta, children }: { meta: MetaData; children: ReactNode }) => {
  const own = useClient()
  const clientOf = useSourceClients()
  const declared = useMemo(() => (meta.sources ?? []).map((status) => status.source), [meta.sources])
  const results = useSourceMetas(declared, clientOf)
  const merged = useMemo(() => withSources(meta, results), [meta, results])
  const routing = useMemo(() => {
    const byResource = new Map(declared.flatMap((source) => source.resources.map((resource) => [resource, source] as const)))
    const resourceClient = (resource: string) => {
      const source = byResource.get(resource)
      return source && clientOf(source)
    }
    return { client: routedClient(own, resourceClient), resourceClient }
  }, [declared, own, clientOf])
  return (
    <ClientProvider client={routing.client} resourceClient={routing.resourceClient}>
      <MetaContext.Provider value={merged}>{children}</MetaContext.Provider>
    </ClientProvider>
  )
}

/**
 * Renders its children once `/meta` has loaded, with the resources of the app's sources as they load. The sources'
 * layer is always there, also without sources, so `/meta` gaining or losing them never draws the app anew.
 */
export const MetaGate = ({ children }: { children: ReactNode }) => {
  const meta = useMeta()
  if (meta.isPending) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <Spinner /> Loading
      </div>
    )
  }
  if (meta.error) {
    return <Notice title="Cannot reach the API">{isApiError(meta.error) ? meta.error.message : 'The server did not answer. Is it running?'}</Notice>
  }
  return <WithSources meta={meta.data}>{children}</WithSources>
}

export { Notice }

/** What the signed-in user may do with a resource; everything when the server does not say. */
export const usePermissions = (resource: string) => useAdminMeta().permissions[resource] ?? allowEverything
