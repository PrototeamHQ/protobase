import { historyIdPattern } from './history'

export { deviceIdParam, devicesPath } from '@protobase/schema/internal'

/** The name of the entry id in the path that marks one entry of the history read. */
export const historyIdParam = 'id'

/**
 * The path of the caller's notification history under the API's system path (`/api`): the list itself, `unread` its
 * unread count, `read` marking all read, or `{ read: id }` marking one entry read. An id that could leave the history's
 * path, any but letters, digits, `_` and `-`, is refused.
 */
export const historyPath = (systemPath: string, part?: 'unread' | 'read' | { read: string }) => {
  const base = `${systemPath}/notifications/history`
  if (part === undefined) return base
  if (typeof part === 'string') return `${base}/${part}`
  if (!historyIdPattern.test(part.read)) throw new Error('A history entry id is letters, digits, "_" and "-" only')
  return `${base}/${part.read}/read`
}
