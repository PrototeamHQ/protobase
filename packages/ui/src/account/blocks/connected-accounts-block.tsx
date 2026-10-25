import { useCallback, useState } from 'react'
import { providerMessage } from '../../auth/auth-messages'
import { useAuth, type SignInProvider } from '../../auth/auth-provider'
import { readProviderError, withoutSignInLink } from '../../auth/provider-link'
import { SignInProvidersSection } from '../sign-in-providers-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

// A link to a provider that did not go through comes back here with the provider's code, shown once.
const takeLinkError = () => {
  const code = readProviderError(window.location.href)
  if (code) window.history.replaceState(window.history.state, '', withoutSignInLink(window.location.href))
  return code
}

const Linked = ({ providers }: { providers: SignInProvider[] }) => {
  const { session, linkProvider } = useAuth()
  const { account } = session
  const [linkError] = useState(takeLinkError)
  const { data: linked, error } = useAccountData(useCallback(() => account.linkedProviders(), [account]), text('couldNotReadMethods'))
  if (!linked) return <AccountLoading error={error} />
  return (
    <SignInProvidersSection
      providers={providers}
      linked={linked}
      onConnect={linkProvider}
      error={linkError && providerMessage(linkError, providers.length === 1 ? providers[0]!.name : text('theProvider'))}
    />
  )
}

/** The `ConnectedAccounts` block: the OAuth providers the signed-in person can link, hidden when the app has none. */
export const ConnectedAccountsBlock = () => {
  const { signInProviders, socialProviders } = useAuth()
  // An account links to an OAuth provider from here; a SAML identity provider links it by signing in.
  const linkable = signInProviders.filter((provider) => socialProviders.includes(provider.id))
  return linkable.length > 0 ? <Linked providers={linkable} /> : null
}
