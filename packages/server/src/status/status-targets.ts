import type { StoreNames } from '../better-auth/store/store-names'
import { usersTarget } from '../notifications/table-names'
import { checkStatusAuth, statusNames, type StatusOptions } from './options'

/**
 * The schema module `status` needs, under the names its options give it, pointing at the users of the auth store
 * `store` names. Refuses an app without sign-in, as it has no organizations (`checkStatusAuth`).
 */
export const statusTargets = (options: StatusOptions, store: StoreNames | undefined) => {
  if (!store) checkStatusAuth(undefined)
  const { users, idType } = usersTarget(store)
  return { status: { names: { ...statusNames(options), users, user_id_type: idType }, resources: {} } }
}
