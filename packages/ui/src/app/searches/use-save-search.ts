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
import { text } from './messages'

const message = (error: unknown) => (error instanceof Error ? error.message : text('somethingWrong'))

/**
 * A list page's "Save search" button for its `filter`: `save` for someone who can list, create and delete the saved
 * searches, `sign-in` for a visitor their resource asks to sign in (`prompt`), nothing otherwise. `saved` while a search
 * has the filter, and `remove` takes it off again; otherwise `saveNew` saves the filter as a search, with the name the
 * user gave (`naming` says how to ask for it) or none. While the list was opened from a saved search (`opened`) whose
 * filter differs, `update` gives that search the list's filter.
 */
export const useSaveSearch = (search: SaveSearchModel, filter: string) => {
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

  const nameField = of?.name === undefined ? undefined : model?.fields[of.name]
  const create = useMutation({
    mutationFn: (name: string | null) => client.create(resource, { [of!.filter]: filter, ...(of!.name && { [of!.name]: name }) }),
    onSuccess: (created) => {
      opened.open(keyOf(created.record))
      toast.show({ state: 'success', title: text('searchSaved'), action: { label: text('openPlural', plural), href: href({ kind: 'list', resource }), onNavigate: open } })
    },
    onError: (error) => toast.show({ state: 'error', title: text('couldNotSave'), description: message(error) }),
    onSettled: () => refresh(resource),
  })
  const remove = useMutation({
    mutationFn: (row: SavedSearchRow) => client.remove(resource, keyOf(row)),
    onError: (error) => toast.show({ state: 'error', title: text('couldNotTakeOff'), description: message(error) }),
    onSettled: () => refresh(resource),
  })
  const update = useMutation({
    mutationFn: (row: SavedSearchRow) => client.update(resource, keyOf(row), { [of!.filter]: filter }, row.etag ?? '*'),
    onSuccess: () => toast.show({ state: 'success', title: text('searchUpdated') }),
    onError: (error) => toast.show({ state: 'error', title: text('couldNotUpdate'), description: message(error) }),
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
    /** How to ask for a new search's name, from its field and view; none when searches have no name. */
    naming: nameField && { label: meta.views[resource]?.fields[nameField.name]?.label ?? humanize(nameField.name), required: !nameField.nullable },
    // Until the saved searches are known, and while a press is on its way, another press would not know what to do
    ready: saved.data !== undefined && !pending,
    updating: update.isPending,
    creating: create.isPending,
    remove: () => current && remove.mutate(current),
    saveNew: (name: string | null, options?: { onSuccess?: () => void }) => create.mutate(name, options),
    update: (options?: { onSuccess?: () => void }) => edited && update.mutate(edited, options),
  }
}
