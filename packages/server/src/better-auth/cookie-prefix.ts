// A browser keeps cookies per host, not per port, so two apps on http://localhost:5173 and :5174 would share one session
// cookie and sign each other out. On https every app has a host of its own, and keeps Better Auth's default names.

/** The prefix of the app's cookie names: Better Auth's own, with the port of an http `baseURL` that names one. */
export const cookiePrefixOf = (baseURL: string) => {
  const { protocol, port } = new URL(baseURL)
  if (protocol !== 'http:' || !port) return 'better-auth'
  return `better-auth-${port}`
}
