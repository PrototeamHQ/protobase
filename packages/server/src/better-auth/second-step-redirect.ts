import { secondStepParam } from '@protobase/schema/internal'
import { createAuthMiddleware } from 'better-auth/api'

/** Where a provider sends the browser back to: Better Auth's OAuth callback, and the SAML assertion consumer service. */
export const providerCallbackPaths = ['/callback/:id', '/sso/saml2/sp/acs/:providerId']

const isCallback = (path: string | undefined) => path !== undefined && providerCallbackPaths.includes(path)

/** The page `location` names, with the second step's marker and its methods; a path stays a path. */
export const withSecondStep = (location: string, methods: string[]) => {
  const url = new URL(location, 'http://local')
  url.searchParams.set(secondStepParam, methods.join(','))
  return url.origin === 'http://local' && location.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.href
}

// The page a callback's redirect goes to, from the answer the endpoint threw: an `APIError` of the router's own, which
// need not be the class `better-auth/api` exports.
const locationOf = (returned: unknown) => {
  const { statusCode, headers } = (returned ?? {}) as { statusCode?: unknown; headers?: unknown }
  return statusCode === 302 && headers instanceof Headers ? (headers.get('location') ?? undefined) : undefined
}

// The two-factor plugin's answer, `ctx.json` of it as a hook returns it to a request or to `auth.api`.
const secondStepMethods = (returned: unknown) => {
  const answer = (returned as { _flag?: unknown; body?: unknown } | null | undefined)?._flag === 'json' ? (returned as { body: unknown }).body : returned
  const { twoFactorRedirect, twoFactorMethods } = (answer ?? {}) as { twoFactorRedirect?: unknown; twoFactorMethods?: unknown }
  return twoFactorRedirect === true ? (Array.isArray(twoFactorMethods) ? twoFactorMethods.filter((method) => typeof method === 'string') : []) : undefined
}

/**
 * The hooks that keep a provider's callback a browser's redirect when the two-factor plugin's hook, between them, asks
 * for the second step instead of signing in: `noteLocation` notes where the callback sent the browser, `sendBack` sends it
 * there again with `?second-step=<methods>`, the session cookie ended and the two-factor cookie set, so that page asks
 * for the second step.
 */
export const secondStepRedirect = () => {
  // The page each callback sent the browser to, by the request's headers.
  const redirects = new WeakMap<Headers, string>()
  return {
    noteLocation: {
      matcher: (context: { path?: string }) => isCallback(context.path),
      handler: createAuthMiddleware(async (ctx) => {
        const location = locationOf(ctx.context.returned)
        if (location && ctx.headers) redirects.set(ctx.headers, location)
      }),
    },
    sendBack: {
      matcher: (context: { path?: string }) => isCallback(context.path),
      handler: createAuthMiddleware(async (ctx) => {
        const location = ctx.headers && redirects.get(ctx.headers)
        const methods = secondStepMethods(ctx.context.returned)
        if (location && methods) throw ctx.redirect(withSecondStep(location, methods))
      }),
    },
  }
}
