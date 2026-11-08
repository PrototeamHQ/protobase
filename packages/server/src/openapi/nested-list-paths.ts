import { belongingPaths } from '../belongs-to'
import type { RequestAccess } from '../request-access'
import { pascal } from './naming'
import { auth, error, listParameters, page, param } from './resource-paths'

/** `GET /{parent}/{key}/{resource}` for each list one way leads to, among the resources the caller lists and reads. */
export const nestedListPaths = async (accesses: RequestAccess[]) => {
  const lists = accesses.filter((access) => access.resolved.operations.list)
  const parents = accesses.filter((access) => access.resolved.operations.read && access.entry.keyTypes.length === 1)
  const pairs = lists.flatMap((list) => parents.map((parent) => ({ list, parent })))
  const paths = await Promise.all(pairs.map(async ({ list, parent }) => {
    const ways = await belongingPaths(list, parent.entry, 0)
    if (ways.length !== 1) return []
    const name = list.entry.name
    return [[`/${parent.entry.name}/{key}/${name}`, {
      get: {
        operationId: `list_${name}_of_${parent.entry.name}`,
        tags: [name],
        summary: `List the ${name} of a ${parent.entry.name} record`,
        description: 'The same list as its own, kept to the records that belong to this record, which the caller must be able to read.',
        parameters: [param('key'), ...listParameters(list.entry)],
        responses: { 200: { description: 'A page', content: page(pascal(name)) }, 400: error('BadRequest'), ...auth, 404: error('NotFound') },
      },
    }] as const]
  }))
  return Object.fromEntries(paths.flat())
}
