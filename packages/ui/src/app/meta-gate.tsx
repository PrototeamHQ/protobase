import { createContext, useContext, type ReactNode } from 'react'
import { isApiError } from '@protobase/client'
import { allowEverything, type MetaData } from '../data/meta-data'
import { useMeta } from '../data/use-meta'
import { Spinner } from '../primitives/spinner'

const MetaContext = createContext<MetaData | null>(null)

export const useAdminMeta = () => {
  const meta = useContext(MetaContext)
  if (!meta) throw new Error('useAdminMeta must be used inside MetaGate')
  return meta
}

const Notice = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex h-full min-h-48 items-center justify-center p-8">
    <div className="max-w-md text-center">
      <h1 className="text-[15px] font-semibold">{title}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{children}</p>
    </div>
  </div>
)

/** Renders its children once `/meta` has loaded. */
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
  return <MetaContext.Provider value={meta.data}>{children}</MetaContext.Provider>
}

export { Notice }

/** What the signed-in user may do with a resource; everything when the server does not say. */
export const usePermissions = (resource: string) => useAdminMeta().permissions[resource] ?? allowEverything
