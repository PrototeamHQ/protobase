import { useMutation } from '@tanstack/react-query'
import type { SaveSearchModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { useClient } from '../../data/api-provider'
import { recordKey } from '../../live/model-helpers'
import { useToast } from '../../toasts'
import { useAdminMeta } from '../meta-gate'
import { useRefreshResource } from '../pages/use-layout-data'
import { can } from '../permissions'
import { useAppAddress } from '../use-app-address'
import { useSavedSearches, type SavedSearchRow } from './use-saved-searches'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

/**
 * A list page's "Save search" button for its `filter`: `save` for someone who can list, create and delete the saved
 * searches, `sign-in` for a visitor their resource asks to sign in (`prompt`), nothing otherwise. A press saves the
 * filter as a search named `name`, or takes the saved one off again.
 */
export const useSaveSearch = (search: SaveSearchModel, filter: string, name: string) => {
  const meta = useAdminMeta()
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const { go } = useAppAddress()
  const { resource } = search
  const model = meta.resources[resource]
  const of = meta.views[resource]?.searchesOf
  const permissions = meta.permissions[resource]
  const usable = model !== undefined && of !== undefined && permissions !== undefined && can(permissions, 'create') && can(permissions, 'delete')
  const prompt = meta.signIn?.[resource]?.signIn
  const saved = useSavedSearches(resource, usable)
  const current = of && saved.data?.find((row) => row[of.filter] === filter)
  const plural = meta.views[resource]?.names?.plural ?? 'saved searches'

  const toggle = useMutation({
    mutationFn: async (existing: SavedSearchRow | undefined) => {
      if (existing) await client.remove(resource, encodeKey(recordKey(model!, existing)))
      else await client.create(resource, { [of!.filter]: filter, ...(of!.name && { [of!.name]: name }) })
    },
    onSuccess: (_, existing) => {
      if (!existing) toast.show({ state: 'success', title: 'Search saved', action: { label: `Open ${plural.toLowerCase()}`, onClick: () => go({ kind: 'list', resource }) } })
    },
    onError: (error, existing) => toast.show({ state: 'error', title: existing ? 'Could not take the search off' : 'Could not save the search', description: message(error) }),
    onSettled: () => refresh(resource),
  })

  return {
    mode: usable ? ('save' as const) : prompt ? ('sign-in' as const) : undefined,
    prompt,
    saved: current !== undefined,
    // Until the saved searches are known, and while a press is on its way, another press would not know what to do
    ready: saved.data !== undefined && !toggle.isPending,
    toggle: () => toggle.mutate(current),
  }
}
