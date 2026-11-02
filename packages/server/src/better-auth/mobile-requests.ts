import { capacitorOrigins } from '../mobile-config'

// The request's one Origin, exactly a Capacitor origin: two Origin headers read as one joined value, so they match none.
const capacitorOriginOf = (request: Request) => {
  const origin = request.headers.get('origin')
  return origin !== null && capacitorOrigins.includes(origin)
}

/**
 * Which requests come from the app's iOS or Android build: `grant` marks a request, and `trusted` gives the Capacitor
 * origin it names as an origin Better Auth trusts, for that very request only. Any other request, or an Origin that is
 * not exactly a Capacitor origin, gets nothing.
 */
export const mobileRequests = () => {
  const granted = new WeakSet<Request>()
  return {
    grant: (request: Request) => {
      granted.add(request)
      return request
    },
    trusted: (request?: Request) => {
      if (!request || !granted.has(request)) return []
      return capacitorOriginOf(request) ? [request.headers.get('origin')!] : []
    },
  }
}

export type MobileRequests = ReturnType<typeof mobileRequests>

const mediaType = (request: Request) => request.headers.get('content-type')?.split(';')[0]!.trim().toLowerCase()

/**
 * Refuses a POST from a Capacitor origin whose body is not JSON. A page can send a form, `text/plain` or multipart POST
 * without a preflight, but not a JSON one, and `/api/auth` answers no preflight: so the grant only ever sees requests
 * the app's native HTTP sends. A request from any other origin is left alone, such as an identity provider's form POST.
 */
export const jsonOnlyOnMobile = (request: Request) => {
  if (request.method !== 'POST' || !capacitorOriginOf(request)) return
  if (mediaType(request) === 'application/json') return
  const body = { message: 'A request from the app takes a JSON body only', code: 'UNSUPPORTED_MEDIA_TYPE' }
  return new Response(JSON.stringify(body), { status: 415, headers: { 'content-type': 'application/json' } })
}
