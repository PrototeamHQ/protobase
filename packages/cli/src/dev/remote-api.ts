import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'
import { isAllowedHost } from './allowed-host'
import { apiRequestPattern } from './api-forward'

/**
 * The origin of the Protobase instance `protobase dev --api` hands the API to, from the URL given: http or https, and
 * no path, since an instance serves its API at /api of its origin.
 */
export const remoteApiOrigin = (value: string) => {
  const url = URL.parse(value)
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) throw new Error(`--api expects an http or https URL, such as https://app.example.com, not "${value}"`)
  if (url.pathname !== '/' || url.search) throw new Error(`--api expects the instance's origin, such as ${url.origin}, without a path`)
  return url.origin
}

// A header holding a URL, Origin or Referer, as a URL when it names the dev server the request came to.
const ofDevServer = (value: string | undefined, request: IncomingMessage) => {
  const url = value === undefined ? null : URL.parse(value)
  return url?.host === request.headers.host ? url : undefined
}

/**
 * Hands the requests the API process answers in `protobase dev` (`isApiRequest`), and the API's WebSockets, to the
 * instance at `origin` through Vite's proxy. The instance sees its own Host, and its own origin in the Origin and Referer
 * of a page of this dev server, so its sign-in and its checks of a request's origin take them; a request from any other
 * page keeps the origin it came with. Its cookies come back without their Domain, for localhost to keep, and a
 * redirect to its own address comes back as a path on this server. A socket whose Host fails Vite's host check is
 * refused, as Vite refuses such a request.
 */
export const remoteApi = (origin: string): Plugin => {
  let allowedHosts: true | readonly string[] = []
  return {
    name: 'protobase-remote-api',
    config: () => ({
      server: {
        proxy: {
          [apiRequestPattern.source]: {
            target: origin,
            changeOrigin: true,
            ws: true,
            rewriteWsOrigin: true,
            cookieDomainRewrite: { '*': '' },
            // A request reaches here past Vite's host check; a socket does not, so it is checked here.
            bypass: (request, response) => (response || isAllowedHost(request.headers.host, allowedHosts) ? undefined : false),
            configure: (proxy) => {
              proxy.on('proxyReq', (upstream, request) => {
                if (ofDevServer(request.headers.origin, request)) upstream.setHeader('origin', origin)
                const referer = ofDevServer(request.headers.referer, request)
                if (referer) upstream.setHeader('referer', `${origin}${referer.pathname}${referer.search}`)
              })
              proxy.on('proxyRes', (answer) => {
                const location = answer.headers.location
                if (location?.startsWith(`${origin}/`)) answer.headers.location = location.slice(origin.length)
              })
            },
          },
        },
      },
    }),
    configResolved: (config) => {
      allowedHosts = config.server.allowedHosts
    },
  }
}
