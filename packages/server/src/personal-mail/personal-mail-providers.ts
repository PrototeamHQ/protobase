import { gmail } from './gmail'
import type { PersonalMailProvider } from './personal-mail-provider'

/** The mail providers Protobase links mailboxes with, by the id `auth.personalMail` names them with. */
export const personalMailProviders = { gmail } satisfies Record<string, () => PersonalMailProvider>

export type PersonalMailProviderId = keyof typeof personalMailProviders

/**
 * A mail provider people may link, as `auth.personalMail` names it: its id alone, such as `'gmail'`, or with optional
 * scopes the link adds for more abilities, such as `{ provider: 'gmail', scopes: [gmailSettingsScope] }` to read the
 * mailbox's send-as addresses.
 */
export type PersonalMailEntry = PersonalMailProviderId | { provider: PersonalMailProviderId; scopes?: string[] }

/**
 * The providers of `entries`, each checked against the app's sign-in providers: linking one goes through its sign-in
 * provider, so an app without it is a configuration error at startup. So is one whose OAuth tokens are not encrypted
 * (`encryptOAuthTokens`): a linked account's tokens send mail as the person, so they are never stored in plain text.
 * So is an added scope the provider does not offer, as a link must never ask for more than its abilities need.
 */
export const resolvePersonalMail = (entries: readonly (PersonalMailEntry | string)[], signInProviders: string[], encryptOAuthTokens: boolean) => {
  if (entries.length > 0 && !encryptOAuthTokens) throw new Error('auth.personalMail: the linked mailboxes\' tokens would be stored in plain text; turn on auth.encryptOAuthTokens')
  return entries.map((entry): PersonalMailProvider => {
    const { provider: id, scopes = [] } = typeof entry === 'string' ? { provider: entry } : entry
    if (!Object.hasOwn(personalMailProviders, id)) throw new Error(`auth.personalMail: "${id}" is not a mail provider; use one of ${Object.keys(personalMailProviders).join(', ')}`)
    const provider = personalMailProviders[id as PersonalMailProviderId]()
    if (!signInProviders.includes(provider.signInProvider)) throw new Error(`auth.personalMail: ${provider.name} links through the sign-in provider "${provider.signInProvider}"; add it to auth.socialProviders`)
    const unknown = scopes.find((scope) => !provider.optionalScopes.includes(scope))
    if (unknown) throw new Error(`auth.personalMail: ${provider.name} does not take the scope "${unknown}"; use one of ${provider.optionalScopes.join(', ')}`)
    // A spread keeps the provider's optional abilities, such as `list_sender_addresses`.
    return { ...provider, addedScopes: [...new Set(scopes)] }
  })
}
