import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useContext, useMemo } from 'react'
import { useClient } from '../data/api-provider'
import type { MetaData } from '../data/meta-data'
import { keys } from '../data/query-keys'
import { ClientStartContext, lastFetchFailed } from '../data/start-cache/restored-state'
import { useMeta } from '../data/use-meta'
import { startAddress } from './start-address'
import { startEntry, startRequest } from './start-record'
import { metaSettled, startTarget, type StartTarget } from './start-target'

export type { StartTarget } from './start-target'

/**
 * What `/` opens: the record the first sidebar entry with `nav.start` finds, read with the caller's access, else the
 * first sidebar entry (`startAddress`). `resolving` while the lookup runs, so `/` draws nothing rather than a list it
 * then leaves; `enabled` false, such as outside any organization, looks nothing up. A lookup the server refuses opens
 * the first entry, as one that finds nothing does, and so does a lookup whose last fetch failed, rather than a record
 * found before. The answer is a query, so the start cache has it on the next start.
 *
 * `organization` is the one the record is looked up in, `''` in an app without organizations: `undefined` while it is
 * not yet known for certain, which resolves, and `null` once it cannot be, which opens the first entry. With
 * organizations, `/` also waits for `/meta` to be read in this page load, or to fail, rather than settle on the start
 * cache's (see `startTarget`).
 */
export const useStartAddress = (meta: MetaData, enabled: boolean, organization: string | null | undefined): StartTarget => {
  const client = useClient()
  const startedAt = useContext(ClientStartContext)
  // Draws again when `/meta` is read again, also unchanged
  const metaQuery = useMeta()
  const metaState = useQueryClient().getQueryState<MetaData>(keys.meta)
  const entry = useMemo(() => startEntry(meta), [meta])
  const fallback = useMemo(() => startAddress(meta), [meta])
  const request = entry && startRequest(entry, meta)
  const query = useQuery({
    queryKey: keys.startRecord(entry?.model.name ?? '', request?.filter ?? '', request?.orderBy ?? '', organization ?? ''),
    queryFn: () => client.list(entry!.model.name, request!),
    enabled: enabled && Boolean(entry) && typeof organization === 'string',
    retry: false,
  })
  return startTarget({
    entry,
    fallback,
    enabled,
    organization,
    metaSettled: metaSettled(meta, metaState, startedAt, lastFetchFailed(metaQuery)),
    lookup: { pending: query.isPending, failed: lastFetchFailed(query), ...(query.data && { rows: query.data.items }) },
  })
}
