/** Where a page is served from: its scheme, such as `https:` or `app:`, and its host. */
export type PageLocation = { protocol: string; host: string }

const isHttp = (protocol: string) => protocol === 'http:' || protocol === 'https:'

/**
 * Sign-in for a page served from an app's own scheme, such as `app://example.test/`, which Better Auth refuses as a base:
 * the https origin of the same host as the base, and a fetch that sends each of its requests to the page's own origin
 * instead, where whatever serves the page also answers `/api/*`. `undefined` for an http or https page, which signs in
 * as it is.
 */
export const customSchemeAuth = (page: PageLocation, fetcher: typeof fetch = (input, init) => fetch(input, init)) => {
  if (isHttp(page.protocol)) return
  const pageOrigin = `${page.protocol}//${page.host}`
  const sameOriginFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const target = `${pageOrigin}${url.pathname}${url.search}`
    return input instanceof Request ? fetcher(new Request(target, input), init) : fetcher(target, init)
  }
  return { origin: `https://${page.host}`, fetch: sameOriginFetch }
}

/** Whether `origin` is an http or https origin, such as the one a page's `<meta name="protobase-api-origin">` names. */
export const isHttpOrigin = (origin: string | undefined) => origin !== undefined && URL.canParse(origin) && isHttp(new URL(origin).protocol)
