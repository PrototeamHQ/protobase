import type { AdminAuth } from './create-auth'
import { storeNames } from './store/store-names'
import { storeTableNames } from './store/table-names'

/** The admin store's tables, which the assistant's queries and the app's resources must never read: the user table and `storeTableNames`. */
export const authStoreTables = (auth: AdminAuth) => {
  const { schema, users } = storeNames(auth)
  return [users.modelName, ...storeTableNames].map((name) => ({ schema, name }))
}
