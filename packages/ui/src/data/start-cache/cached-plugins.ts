import type { PluginRef } from '@protobase/client'
import type { MetaData } from '../meta-data'
import { keys } from '../query-keys'
import type { StartCache } from './start-cache'

/** The plugins the start cache's `/meta` names, for the signed-in person it was kept for: the app loads them before it draws. */
export const cachedPlugins = (cache: StartCache | undefined): PluginRef[] => {
  const session = cache?.session()
  if (!session) return []
  const meta = cache?.queries(`user:${session.user.id}`)?.state.queries.find((query) => JSON.stringify(query.queryKey) === JSON.stringify(keys.meta))
  return (meta?.state.data as MetaData | undefined)?.plugins ?? []
}
