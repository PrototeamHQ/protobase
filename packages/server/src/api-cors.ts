import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { readList } from './better-auth/origins'
import { capacitorOrigins } from './mobile-config'

export const corsOriginsVariable = 'PROTOBASE_CORS_ORIGINS'

/** The websites whose browser code may call the API: `*` for any, or a list of origins such as `https://shop.com`. */
export type CorsOrigins = '*' | string[]

/**
 * The origins in `PROTOBASE_CORS_ORIGINS`, `*` or comma separated; `undefined` when it is unset. One that is not an
 * http or https URL stops the server at startup: another scheme, such as `capacitor:`, has the origin `null`.
 */
export const readCorsOrigins = (env: Record<string, string | undefined>): CorsOrigins | undefined => {
  const value = env[corsOriginsVariable]?.trim()
  if (!value) return undefined
  if (value === '*') return '*'
  return readList(value).map((origin) => {
    if (!URL.canParse(origin)) throw new Error(`${corsOriginsVariable} lists "${origin}", which is not a URL such as https://shop.com`)
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${corsOriginsVariable} lists "${origin}", but it takes http and https origins only; a mobile section in protobase.config.ts allows the app's Capacitor origins`)
    }
    return url.origin
  })
}

/** The allowed origins plus the Capacitor ones when the app has a mobile section; `*` stays `*`. */
export const withMobileOrigins = (allowed: CorsOrigins | undefined, mobile: boolean): CorsOrigins | undefined => {
  if (!mobile || allowed === '*') return allowed
  return [...new Set([...(allowed ?? []), ...capacitorOrigins])]
}

// Bearer tokens, not cookies, so no credentials. A write sends its ETag back in `If-Match`, `/meta` in `If-None-Match`;
// supabase-js sends the app's key in `apikey` and names itself in `x-client-info` and `x-supabase-api-version`.
const allowHeaders = ['authorization', 'content-type', 'if-match', 'if-none-match', 'apikey', 'x-client-info', 'x-supabase-api-version']
const exposeHeaders = ['location', 'etag', 'x-meta-version', 'x-protobase-warning']

export type ApiCorsInput = {
  /** The app's own origins, always allowed: browser code on one may call the API on another. */
  own: string[]
  /** The other websites allowed, or `*` for any. */
  allowed: CorsOrigins
  /** Paths that answer CORS themselves, or not at all, such as Better Auth's. */
  skip: (path: string) => boolean
}

/**
 * CORS for the API: an allowed origin gets `Access-Control-Allow-Origin` (`*` when any is), preflights are answered
 * before authentication and kept for ten minutes.
 */
export const apiCors = ({ own, allowed, skip }: ApiCorsInput): MiddlewareHandler => {
  const origin = (requestOrigin: string) => {
    if (allowed === '*') return '*'
    return own.includes(requestOrigin) || allowed.includes(requestOrigin) ? requestOrigin : null
  }
  const handler = cors({ origin, allowHeaders, exposeHeaders, maxAge: 600, allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] })
  return (c, next) => (skip(c.req.path) ? next() : handler(c, next))
}
