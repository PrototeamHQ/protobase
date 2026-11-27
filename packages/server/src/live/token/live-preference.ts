import type { Context } from 'hono'

/**
 * Whether the request asks for a live token: RFC 7240 `Prefer: live`, alone or among other preferences, in one header
 * or several, or `?live=1` where a page cannot set headers.
 */
export const asksLive = (c: Context) => {
  if (c.req.query('live') === '1') return true
  const header = c.req.header('prefer') ?? ''
  return header.split(',').some((preference) => preference.split(/[=;]/, 1)[0]!.trim().toLowerCase() === 'live')
}
