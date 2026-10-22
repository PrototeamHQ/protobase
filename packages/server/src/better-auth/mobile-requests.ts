import { capacitorOrigins } from '../mobile-config'

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
      const origin = request.headers.get('origin')
      return origin !== null && capacitorOrigins.includes(origin) ? [origin] : []
    },
  }
}

export type MobileRequests = ReturnType<typeof mobileRequests>
