/** A guard's watch: the page parameters whose change replaces the content it sits in, such as the row a `select` chose. */
export type GuardWatch = { params: readonly string[] }

/** Whether going from `from` to `to` leaves what a guard holds: another page, or a change of a parameter one watches. */
export const leavesPage = (from: string, to: string, guards: Iterable<GuardWatch>) => {
  const before = new URL(from, 'http://local')
  const after = new URL(to, 'http://local')
  if (before.pathname !== after.pathname) return true
  return [...guards].some((guard) => guard.params.some((name) => before.searchParams.get(name) !== after.searchParams.get(name)))
}
