import type { QueryState } from '@tanstack/react-query'
import type { AppAddress } from '@protobase/schema'
import type { MetaData } from '../data/meta-data'
import { isAnsweredNow } from '../data/start-cache/restored-state'
import type { StartEntry } from './start-record'
import { startKey } from './start-record'

export type StartTarget = { state: 'resolving' } | { state: 'ready'; address?: AppAddress }

/** Where the start record's lookup stands: still running, its last fetch failed, or the rows it found. */
export type StartLookup = { pending: boolean; failed: boolean; rows?: Record<string, unknown>[] }

/**
 * What `/` opens, from the start entry and first sidebar entry of `/meta` (`startEntry`, `startAddress`) and the start
 * record's lookup; see `useStartAddress`. In an app with organizations (`organization` other than `''`) it waits for a
 * `/meta` answered in this page load (`metaSettled`), as a cached one may be from another organization or from none,
 * such as the one cached on the first-organization screen, which names no start.
 */
export const startTarget = ({ entry, fallback, enabled, organization, metaSettled, lookup }: {
  entry: StartEntry | undefined
  fallback: AppAddress | undefined
  enabled: boolean
  organization: string | null | undefined
  metaSettled: boolean
  lookup: StartLookup
}): StartTarget => {
  const opensFallback: StartTarget = { state: 'ready', ...(fallback && { address: fallback }) }
  if (organization === null) return opensFallback
  if (organization !== '' && !metaSettled) return enabled ? { state: 'resolving' } : opensFallback
  if (!entry) return opensFallback
  if (organization === undefined || lookup.pending) return enabled ? { state: 'resolving' } : opensFallback
  if (lookup.failed) return opensFallback
  const key = lookup.rows && startKey(entry.model, lookup.rows)
  if (key !== undefined) return { state: 'ready', address: { kind: 'record', resource: entry.model.name, key } }
  return opensFallback
}

/**
 * Whether the `/meta` drawn is one read in this page load, or the start cache's once reading it again failed: the one
 * the `/meta` query holds (`state`), compared by ETag, as what is drawn may still be the query's previous answer for a
 * render.
 */
export const metaSettled = (drawn: MetaData, state: Pick<QueryState<MetaData>, 'data' | 'dataUpdatedAt'> | undefined, startedAt: number, lastFailed: boolean) =>
  state?.data?.etag === drawn.etag && (isAnsweredNow(state, startedAt) || lastFailed)
