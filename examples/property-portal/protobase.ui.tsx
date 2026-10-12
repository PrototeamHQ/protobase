import { defineUi, type ActionContext } from '@protobase/ui'

// The signed-in member's favorite of the listing on the page, if they saved it: the API lists only their own.
const favoriteOf = async ({ record, client }: ActionContext) => {
  const saved = await client.list('favorites', { filter: `listing_id = ${String(record!.id)}`, pageSize: 1 })
  return saved.items[0]
}

/** "Save to favorites" on a listing: saves it once, however often it is pressed. */
const save_favorite = async (context: ActionContext) => {
  if (await favoriteOf(context)) return
  await context.client.create('favorites', { listing_id: context.record!.id })
}

/** "Remove from favorites" on a listing: takes it off, when it was saved. */
const remove_favorite = async (context: ActionContext) => {
  const favorite = await favoriteOf(context)
  if (favorite) await context.client.remove('favorites', String(favorite.id))
}

export default defineUi({ actions: { save_favorite, remove_favorite } })
