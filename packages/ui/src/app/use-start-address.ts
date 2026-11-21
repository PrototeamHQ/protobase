import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { AppAddress } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import type { MetaData } from '../data/meta-data'
import { keys } from '../data/query-keys'
import { lastFetchFailed } from '../data/start-cache/restored-state'
import { startAddress } from './start-address'
import { startEntry, startKey, startRequest } from './start-record'

export type StartTarget = { state: 'resolving' } | { state: 'ready'; address?: AppAddress }

/**
 * What `/` opens: the record the first sidebar entry with `nav.start` finds, read with the caller's access, else the
 * first sidebar entry (`startAddress`). `resolving` while the lookup runs, so `/` draws nothing rather than a list it
 * then leaves; `enabled` false, such as outside any organization, looks nothing up. A lookup the server refuses opens
 * the first entry, as one that finds nothing does, and so does a lookup whose last fetch failed, rather than a record
 * found before. The answer is a query, so the start cache has it on the next start.
 *
 * `organization` is the one the record is looked up in, `''` in an app without organizations: `undefined` while it is
 * not yet known for certain, which resolves, and `null` once it cannot be, which opens the first entry.
 */
export const useStartAddress = (meta: MetaData, enabled: boolean, organization: string | null | undefined): StartTarget => {
  const client = useClient()
  const entry = useMemo(() => startEntry(meta), [meta])
  const fallback = useMemo(() => startAddress(meta), [meta])
  const request = entry && startRequest(entry, meta)
  const query = useQuery({
    queryKey: keys.startRecord(entry?.model.name ?? '', request?.filter ?? '', request?.orderBy ?? '', organization ?? ''),
    queryFn: () => client.list(entry!.model.name, request!),
    enabled: enabled && Boolean(entry) && typeof organization === 'string',
    retry: false,
  })
  const opensFallback: StartTarget = { state: 'ready', ...(fallback && { address: fallback }) }
  if (!entry || organization === null) return opensFallback
  if (organization === undefined || query.isPending) return enabled ? { state: 'resolving' } : opensFallback
  if (lastFetchFailed(query)) return opensFallback
  const key = query.data && startKey(entry.model, query.data.items)
  if (key !== undefined) return { state: 'ready', address: { kind: 'record', resource: entry.model.name, key } }
  return opensFallback
}
