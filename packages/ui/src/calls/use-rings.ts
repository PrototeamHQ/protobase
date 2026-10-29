import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { ringNotice } from '@protobase/schema/internal'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { ringingAt, ringsUntil, type ShownRing } from './ringing'

/**
 * The calls ringing the signed-in user now, while `enabled`: read on load, and again whenever the live stream the page
 * already holds says they changed, as when the user answers on another device, declines or the call ends; each stops
 * by itself once its time is up. `decline` stops one on every page of theirs, `hide` only on this one.
 */
export const useRings = (enabled: boolean) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: keys.rings, queryFn: async () => ringsUntil(await client.rings.list(), Date.now()), enabled })

  useEffect(() => {
    if (!enabled) return
    const again = () => void queryClient.invalidateQueries({ queryKey: keys.rings })
    return client.live({ onChanges: (changes) => changes.some((change) => change.resource === ringNotice) && again(), onResync: again })
  }, [client, queryClient, enabled])

  const [now, setNow] = useState(() => Date.now())
  const { ringing, next } = ringingAt(query.data ?? [], Math.max(now, query.dataUpdatedAt))
  useEffect(() => {
    if (next === undefined) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, next - Date.now()))
    return () => clearTimeout(timer)
  }, [next])

  // A ring answered here shows no more at once, before the server has the join that stops it.
  const hide = useCallback((call: string) => queryClient.setQueryData<ShownRing[]>(keys.rings, (rings) => rings?.filter((ring) => ring.call !== call)), [queryClient])
  const decline = useMutation({
    mutationFn: (call: string) => client.rings.decline(call),
    onMutate: hide,
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.rings }),
  })
  return { ringing, decline: decline.mutate, hide }
}
