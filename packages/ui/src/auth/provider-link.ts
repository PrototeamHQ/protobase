/** Marks a link that starts signing in with a provider at once, for example `/?sign-in=github`. */
export const signInMarker = 'sign-in'

/** Where a provider's callback says why a sign-in or a link did not go through, for example `signup_disabled`. */
const errorParam = 'error'

/**
 * The provider a link asks to sign in with, or `undefined`. A link that came back from the provider with an error
 * starts nothing, so a refused sign-in does not go round again.
 */
export const readSignInLink = (href: string): string | undefined => {
  const params = new URL(href).searchParams
  if (params.has(errorParam)) return undefined
  return params.get(signInMarker) || undefined
}

/** Why the provider sent the browser back here, or `undefined`. */
export const readProviderError = (href: string): string | undefined => new URL(href).searchParams.get(errorParam) || undefined

/** The address without the link's marker and the provider's error: for the address bar, and the page to come back to. */
export const withoutSignInLink = (href: string) => {
  const url = new URL(href)
  for (const name of [signInMarker, errorParam]) url.searchParams.delete(name)
  return `${url.pathname}${url.search}${url.hash}`
}

const knownNames: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', google: 'Google', microsoft: 'Microsoft', apple: 'Apple' }

/** The name of a sign-in provider: the platform's own name for its provider, or a well-known provider's name. */
export const providerName = (provider: string, platformSignIn?: { provider: string; name: string }) =>
  platformSignIn?.provider === provider ? platformSignIn.name : (knownNames[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1))
