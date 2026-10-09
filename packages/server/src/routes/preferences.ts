import type { Context } from 'hono'

/** RFC 7240 `Prefer: return=minimal | representation`; the representation is the default. */
export const returnPreference = (c: Context) => {
  const match = /return=(minimal|representation)/.exec(c.req.header('prefer') ?? '')
  const applied: Record<string, string> = match ? { 'Preference-Applied': match[0] } : {}
  return { minimal: match?.[1] === 'minimal', applied }
}
