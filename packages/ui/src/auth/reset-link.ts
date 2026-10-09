/** Marks the address an emailed reset link leads back to, so the app opens the set-password page there. */
export const resetMarker = 'password-reset'

/** Where the emailed link leads back to: this page, marked. */
export const resetLinkTarget = (href: string) => {
  const url = new URL(href)
  return `${url.origin}${url.pathname}?${resetMarker}`
}

/**
 * The reset link this page was opened from, or `undefined`. Better Auth adds the `token`, or `error=INVALID_TOKEN`
 * instead for a used or expired link; then `token` is `undefined`.
 */
export const readResetLink = (href: string): { token: string | undefined } | undefined => {
  const params = new URL(href).searchParams
  if (!params.has(resetMarker)) return undefined
  return { token: params.get('token') || undefined }
}

/** The address without the reset link's parameters, for the address bar once the link is used. */
export const withoutResetLink = (href: string) => {
  const url = new URL(href)
  for (const name of [resetMarker, 'token', 'error']) url.searchParams.delete(name)
  return `${url.pathname}${url.search}${url.hash}`
}
