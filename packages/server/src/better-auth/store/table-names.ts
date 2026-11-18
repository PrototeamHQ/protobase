import type { ResolvedNames } from '../names/resolve-names'

/**
 * The admin store's tables besides the user table, as the app names them: every module's, which the store has whether
 * the app turns the feature on or not, and the record of its migrations.
 */
export const storeTableNamesOf = (names: ResolvedNames) => Object.values(names.tables).filter(({ internal }) => internal !== 'user').map(({ name }) => name)
