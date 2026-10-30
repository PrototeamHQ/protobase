import { gmail } from './gmail'
import type { PersonalMailProvider } from './personal-mail-provider'

/** The mail providers Protobase links mailboxes with, by the id `auth.personalMail` names them with. */
export const personalMailProviders = { gmail } satisfies Record<string, () => PersonalMailProvider>

export type PersonalMailProviderId = keyof typeof personalMailProviders

/**
 * The providers of `ids`, each checked against the app's sign-in providers: linking one goes through its sign-in
 * provider, so an app without it is a configuration error at startup.
 */
export const resolvePersonalMail = (ids: readonly string[], signInProviders: string[]) =>
  ids.map((id) => {
    if (!Object.hasOwn(personalMailProviders, id)) throw new Error(`auth.personalMail: "${id}" is not a mail provider; use one of ${Object.keys(personalMailProviders).join(', ')}`)
    const provider = personalMailProviders[id as PersonalMailProviderId]()
    if (!signInProviders.includes(provider.signInProvider)) throw new Error(`auth.personalMail: ${provider.name} links through the sign-in provider "${provider.signInProvider}"; add it to auth.socialProviders`)
    return provider
  })
