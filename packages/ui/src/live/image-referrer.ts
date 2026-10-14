/**
 * The `referrerPolicy` an image at `url` is drawn with on the page at `page`: the browser's default for the page's own
 * origin, a trusted host, or a local image (`data:`, `blob:`); `no-referrer` for any other, so another site never learns
 * which page of the app showed its image.
 */
export const imageReferrerPolicy = (url: string, page: string, trustedHosts: readonly string[]) => {
  if (!URL.canParse(url, page)) return 'no-referrer' as const
  const target = new URL(url, page)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return undefined
  if (target.origin === new URL(page).origin || trustedHosts.includes(target.hostname)) return undefined
  return 'no-referrer' as const
}
