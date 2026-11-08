// A browser keeps cookies per host, not per port, so two apps on http://localhost:5173 and :5174 would share one session
// cookie and sign each other out. On https every app has a host of its own, and its cookies carry the `__Host-` prefix:
// the browser keeps such a cookie only when the app's own host sets it, Secure, on `Path=/` and without a Domain, so an
// app on a sibling host of a shared domain cannot plant a session or a sign-in flow cookie of its own on this one.

/** The prefix of the app's cookie names: `__Host-` on https, the port of an http `baseURL` that names one. */
export const cookiePrefixOf = (baseURL: string) => {
  const { protocol, port } = new URL(baseURL)
  if (protocol === 'https:') return '__Host-better-auth'
  if (!port) return 'better-auth'
  return `better-auth-${port}`
}
