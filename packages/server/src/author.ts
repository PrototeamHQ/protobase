import type { RequestAccess } from './request-access'
import type { Row } from './types'

/**
 * The values of a create with its `.author()` field set to the signed-in user's id. No request may write the field
 * (access resolution never counts it writable, so validation refuses it as read-only), so this is its only source; a
 * create by no one signed in, such as a public form's, leaves it empty.
 */
export const withAuthor = (access: Pick<RequestAccess, 'full' | 'session'>, values: Row) => {
  const { author } = access.full
  if (!author || access.session.anonymous) return values
  return { ...values, [author]: access.session.user.id }
}
