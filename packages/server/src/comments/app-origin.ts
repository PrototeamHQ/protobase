/**
 * The origin the app answers a request to `requestURL` on: the request's own when it is one of `origins`, else the
 * first of them, the app's base URL. Any origin when there are none to check against.
 */
export const appOrigin = (origins: readonly string[]) => (requestURL: string) => {
  const origin = new URL(requestURL).origin
  return origins.length === 0 || origins.includes(origin) ? origin : origins[0]!
}
