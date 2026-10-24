// The hosts of the browsers' push services, which a Web Push endpoint must be on: Chrome's and other Chromium
// browsers', Firefox's, Edge's (one host per region) and Safari's.
const exactHosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']
const hostSuffixes = ['.notify.windows.com']

/** Whether `endpoint`, as a browser's subscription gives it, is an https URL on a known push service, with no userinfo, port or fragment. */
export const isPushEndpoint = (endpoint: string) => {
  if (!URL.canParse(endpoint) || endpoint.includes('#')) return false
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return false
  return exactHosts.includes(url.hostname) || hostSuffixes.some((suffix) => url.hostname.endsWith(suffix) && url.hostname.length > suffix.length)
}

/** The endpoint as one spelling, so two spellings of one subscription are one device. */
export const canonicalEndpoint = (endpoint: string) => new URL(endpoint).href
