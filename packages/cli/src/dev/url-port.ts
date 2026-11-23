const loopbackHosts = ['localhost', '127.0.0.1', '[::1]']

/**
 * A warning when PROTOBASE_URL is this machine on another port than the dev server's: sign-in then refuses the pages
 * the dev server serves, since they come from another origin. Undefined otherwise, such as for a tunnel's URL.
 */
export const urlPortWarning = (env: NodeJS.ProcessEnv, port: number) => {
  const value = env.PROTOBASE_URL?.trim()
  if (!value || !URL.canParse(value)) return
  const url = new URL(value)
  if (!loopbackHosts.includes(url.hostname)) return
  const urlPort = url.port || (url.protocol === 'https:' ? '443' : '80')
  if (urlPort === String(port)) return
  return `PROTOBASE_URL is ${url.origin}, but protobase dev serves http://localhost:${port}, where sign-in refuses its pages: remove PROTOBASE_URL from .env, so dev uses its own address, or run protobase dev --port ${urlPort} once to keep that port`
}
