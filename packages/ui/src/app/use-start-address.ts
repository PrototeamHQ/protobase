import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { AppAddress } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import type { MetaData } from '../data/meta-data'
import { keys } from '../data/query-keys'
import { startAddress } from './start-address'
import { startEntry, startKey, startRequest } from './start-record'

export type StartTarget = { state: 'resolving' } | { state: 'ready'; address?: AppAddress }

/**
 * What `/` opens: the record the first sidebar entry with `nav.start` finds, read with the caller's access, else the
 * first sidebar entry (`startAddress`). `resolving` while the lookup runs, so `/` draws nothing rather than a list it
 * then leaves; `enabled` false, such as outside any organization, looks nothing up. A lookup the server refuses opens
 * the first entry, as one that finds nothing does. The answer is a query, so the start cache has it on the next start.
 */
export const useStartAddress = (meta: MetaData, enabled: boolean): StartTarget => {
  const client = useClient()
  const entry = useMemo(() => startEntry(meta), [meta])
  const fallback = useMemo(() => startAddress(meta), [meta])
  const request = entry && startRequest(entry, meta)
  const query = useQuery({
    queryKey: keys.startRecord(entry?.model.name ?? '', request?.filter ?? '', request?.orderBy ?? ''),
    queryFn: () => client.list(entry!.model.name, request!),
    enabled: enabled && Boolean(entry),
    retry: false,
  })
  if (!entry) return { state: 'ready', ...(fallback && { address: fallback }) }
  if (query.isPending) return enabled ? { state: 'resolving' } : { state: 'ready', ...(fallback && { address: fallback }) }
  const key = query.data && startKey(entry.model, query.data.items)
  if (key !== undefined) return { state: 'ready', address: { kind: 'record', resource: entry.model.name, key } }
  return { state: 'ready', ...(fallback && { address: fallback }) }
}
