import { useMutation } from '@tanstack/react-query'
import type { SaveSearchModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { useClient } from '../../data/api-provider'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { useToast } from '../../toasts'
import { useAdminMeta } from '../meta-gate'
import { useRefreshResource } from '../pages/use-layout-data'
import { can } from '../permissions'
import { useAppAddress } from '../use-app-address'
import { useOpenedSearch } from './use-opened-search'
import { useSavedSearches, type SavedSearchRow } from './use-saved-searches'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

/**
 * A list page's "Save search" button for its `filter`: `save` for someone who can list, create and delete the saved
 * searches, `sign-in` for a visitor their resource asks to sign in (`prompt`), nothing otherwise. `saved` while a search
 * has the filter, and a press takes it off again; otherwise a press saves the filter as a search named `name`. While the
 * list was opened from a saved search (`opened`) whose filter differs, `update` gives that search the list's filter, and
 * `saveNew` saves it as another.
 */
export const useSaveSearch = (search: SaveSearchModel, filter: string, name: string) => {
  const meta = useAdminMeta()
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const { href, open } = useAppAddress()
  const opened = useOpenedSearch()
  const { resource } = search
  const model = meta.resources[resource]
  const of = meta.views[resource]?.searchesOf
  const permissions = meta.permissions[resource]
  const usable = model !== undefined && of !== undefined && permissions !== undefined && can(permissions, 'create') && can(permissions, 'delete')
  const prompt = meta.signIn?.[resource]?.signIn
  const saved = useSavedSearches(resource, usable)
  const keyOf = (row: SavedSearchRow) => encodeKey(recordKey(model!, row))
  const current = of && saved.data?.find((row) => row[of.filter] === filter)
  // The search the list was opened from, while no search has the list's filter; one the user may change
  const edited = current || opened.key === undefined || !permissions || !can(permissions, 'update') ? undefined : saved.data?.find((row) => keyOf(row) === opened.key)
  const names = meta.views[resource]?.names
  const plural = names?.plural ?? 'saved searches'

  const create = useMutation({
    mutationFn: () => client.create(resource, { [of!.filter]: filter, ...(of!.name && { [of!.name]: name }) }),
    onSuccess: (created) => {
      opened.open(keyOf(created.record))
      toast.show({ state: 'success', title: 'Search saved', action: { label: `Open ${plural.toLowerCase()}`, href: href({ kind: 'list', resource }), onNavigate: open } })
    },
    onError: (error) => toast.show({ state: 'error', title: 'Could not save the search', description: message(error) }),
    onSettled: () => refresh(resource),
  })
  const remove = useMutation({
    mutationFn: (row: SavedSearchRow) => client.remove(resource, keyOf(row)),
    onError: (error) => toast.show({ state: 'error', title: 'Could not take the search off', description: message(error) }),
    onSettled: () => refresh(resource),
  })
  const update = useMutation({
    mutationFn: (row: SavedSearchRow) => client.update(resource, keyOf(row), { [of!.filter]: filter }, row.etag ?? '*'),
    onSuccess: () => toast.show({ state: 'success', title: 'Search updated' }),
    onError: (error) => toast.show({ state: 'error', title: 'Could not update the search', description: message(error) }),
    onSettled: () => refresh(resource),
  })
  const pending = create.isPending || remove.isPending || update.isPending

  return {
    mode: usable ? ('save' as const) : prompt ? ('sign-in' as const) : undefined,
    prompt,
    saved: current !== undefined,
    /** The search the list was opened from and differs from: its filter, and its name when it has one. */
    opened: edited && { filter: String(edited[of!.filter] ?? ''), name: of!.name && typeof edited[of!.name] === 'string' && edited[of!.name] !== '' ? String(edited[of!.name]) : undefined },
    /** What one search is called, as the saved searches' view names it. */
    noun: (names?.singular ?? humanize(resource)).toLowerCase(),
    // Until the saved searches are known, and while a press is on its way, another press would not know what to do
    ready: saved.data !== undefined && !pending,
    updating: update.isPending,
    creating: create.isPending,
    toggle: () => (current ? remove.mutate(current) : create.mutate()),
    saveNew: (options?: { onSuccess?: () => void }) => create.mutate(undefined, options),
    update: (options?: { onSuccess?: () => void }) => edited && update.mutate(edited, options),
  }
}
