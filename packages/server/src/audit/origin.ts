import type { AuditOrigin } from '../types'

/** Where a request came from, for an audit event: its user agent and the proxies' `X-Forwarded-For`, when sent. */
export const auditOrigin = (headers: Headers): AuditOrigin => {
  const userAgent = headers.get('user-agent')
  const forwardedFor = headers.get('x-forwarded-for')
  return { ...(userAgent !== null && { userAgent }), ...(forwardedFor !== null && { forwardedFor }) }
}
