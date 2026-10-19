import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CardFavoriteModel, KeyValue } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { useToast } from '../../toasts'
import { useAdminMeta } from '../meta-gate'
import { useRefreshResource } from '../pages/use-layout-data'
import { can } from '../permissions'
import { savedFor, withoutSaved, withSaved, type SavedRecord } from './saved-records'
import { savedRecordsKey, useSavedRecords } from './use-saved-records'
import { text } from './messages'

const message = (error: unknown) => (error instanceof Error ? error.message : text('somethingWrong'))

/**
 * A card's favorite button: `save` for someone who can list, create and delete the saved records, `sign-in` for a
 * visitor the saved records' resource asks to sign in (`prompt`), nothing otherwise. A press saves the card's record,
 * or takes it off, at once on screen; a refused write puts it back and says why.
 */
export const useFavorite = (favorite: CardFavoriteModel, key: string, target: KeyValue) => {
  const meta = useAdminMeta()
  const client = useClient()
  const queryClient = useQueryClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const { resource, field } = favorite
  const permissions = meta.permissions[resource]
  const usable = meta.resources[resource] !== undefined && permissions !== undefined && can(permissions, 'create') && can(permissions, 'delete')
  const prompt = meta.signIn?.[resource]?.signIn
  const saved = useSavedRecords(resource, field, usable)
  const current = saved.data && savedFor(saved.data, key)
  const cacheKey = savedRecordsKey(resource, field)

  const toggle = useMutation({
    mutationFn: async (existing: SavedRecord | undefined) => {
      if (existing) await client.remove(resource, existing.key)
      else await client.create(resource, { [field]: target })
    },
    onMutate: async (existing) => {
      await queryClient.cancelQueries({ queryKey: cacheKey, exact: true })
      const before = queryClient.getQueryData<SavedRecord[]>(cacheKey)
      queryClient.setQueryData<SavedRecord[]>(cacheKey, (list = []) => (existing ? withoutSaved(list, key) : withSaved(list, target)))
      return { before }
    },
    onError: (error, existing, context) => {
      queryClient.setQueryData(cacheKey, context?.before)
      toast.show({ state: 'error', title: existing ? text('couldNotTakeOff') : text('couldNotSave'), description: message(error) })
    },
    onSettled: () => refresh(resource),
  })

  return {
    mode: usable ? ('save' as const) : prompt ? ('sign-in' as const) : undefined,
    prompt,
    saved: current !== undefined,
    // Until the saved records are known, and while a press is on its way, another press would not know what to do
    ready: saved.data !== undefined && !toggle.isPending,
    toggle: () => toggle.mutate(current),
  }
}
