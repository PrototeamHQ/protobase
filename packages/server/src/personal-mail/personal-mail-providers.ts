import { gmail } from './gmail'
import type { PersonalMailProvider } from './personal-mail-provider'

/** The mail providers Protobase links mailboxes with, by the id `auth.personalMail` names them with. */
export const personalMailProviders = { gmail } satisfies Record<string, () => PersonalMailProvider>

export type PersonalMailProviderId = keyof typeof personalMailProviders

/**
 * The providers of `ids`, each checked against the app's sign-in providers: linking one goes through its sign-in
 * provider, so an app without it is a configuration error at startup. So is one whose OAuth tokens are not encrypted
 * (`encryptOAuthTokens`): a linked account's tokens send mail as the person, so they are never stored in plain text.
 */
export const resolvePersonalMail = (ids: readonly string[], signInProviders: string[], encryptOAuthTokens: boolean) => {
  if (ids.length > 0 && !encryptOAuthTokens) throw new Error('auth.personalMail: the linked mailboxes\' tokens would be stored in plain text; turn on auth.encryptOAuthTokens')
  return ids.map((id) => {
    if (!Object.hasOwn(personalMailProviders, id)) throw new Error(`auth.personalMail: "${id}" is not a mail provider; use one of ${Object.keys(personalMailProviders).join(', ')}`)
    const provider = personalMailProviders[id as PersonalMailProviderId]()
    if (!signInProviders.includes(provider.signInProvider)) throw new Error(`auth.personalMail: ${provider.name} links through the sign-in provider "${provider.signInProvider}"; add it to auth.socialProviders`)
    return provider
  })
}
