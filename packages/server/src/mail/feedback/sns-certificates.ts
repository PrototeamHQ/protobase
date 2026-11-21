/** How long a fetched signing certificate is kept, and how many at most: SNS signs with one per region at a time. */
const keepMs = 60 * 60 * 1000
const maxKept = 16

/** How long fetching a certificate may take. */
const fetchMs = 5000

/** Fetches an SNS signing certificate as PEM text. */
export type CertificateSource = (url: string) => Promise<string>

/** Fetches the certificate at `url`, an address `isSnsUrl` accepted. */
export const fetchCertificate: CertificateSource = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(fetchMs), redirect: 'error' })
  if (!response.ok) throw new Error(`The SNS signing certificate ${url} answered ${response.status}`)
  return response.text()
}

/**
 * `source`, with the certificates it fetched kept for an hour, at most 16, the oldest dropped first, so a burst of
 * notifications fetches each certificate once: requests that miss while a fetch runs share it, and a failed fetch is
 * not kept.
 */
export const keptCertificates = (source: CertificateSource, now = Date.now): CertificateSource => {
  const kept = new Map<string, { pem: string; until: number }>()
  const fetching = new Map<string, Promise<string>>()
  const fetchAndKeep = async (url: string) => {
    const pem = await source(url)
    kept.delete(url)
    if (kept.size >= maxKept) kept.delete(kept.keys().next().value!)
    kept.set(url, { pem, until: now() + keepMs })
    return pem
  }
  return (url) => {
    const found = kept.get(url)
    if (found && found.until > now()) return Promise.resolve(found.pem)
    const running = fetching.get(url)
    if (running) return running
    const fetched = fetchAndKeep(url).finally(() => fetching.delete(url))
    fetching.set(url, fetched)
    return fetched
  }
}
