import { useCallback, useEffect, useState } from 'react'
import { AuthError, type AccountSignIn, type ConnectedApp, type Passkey } from '@protobase/client'
import { PageHeader } from '../app-shell'
import { authMessage, providerMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { readProviderError, withoutSignInLink } from '../auth/provider-link'
import { Spinner } from '../primitives/spinner'
import { ConnectedAppsSection } from './connected-apps-section'
import { PasskeysSection } from './passkeys-section'
import { SignInProvidersSection } from './sign-in-providers-section'
import { TwoFactorSection } from './two-factor-section'
import { text } from './messages'

type Loaded = { methods: AccountSignIn; passkeys: Passkey[]; linked: string[]; apps: ConnectedApp[] }

// A link to a provider that did not go through comes back here with the provider's code, shown once.
const takeLinkError = () => {
  const code = readProviderError(window.location.href)
  if (code) window.history.replaceState(window.history.state, '', withoutSignInLink(window.location.href))
  return code
}

/**
 * The signed-in person's passkeys, two-factor authentication and connected accounts, within what the sign-in policy
 * allows, and with MCP on the apps they allowed to act as them.
 */
export const AccountSecurityPage = ({ email }: { email: string }) => {
  const { session, signInProviders, socialProviders, linkProvider, mcp } = useAuth()
  // An account links to an OAuth provider from here; a SAML identity provider links it by signing in.
  const linkable = signInProviders.filter((provider) => socialProviders.includes(provider.id))
  const { account } = session
  const [loaded, setLoaded] = useState<Loaded>()
  const [error, setError] = useState<string>()
  const [linkError] = useState(takeLinkError)

  const reload = useCallback(() => {
    void Promise.all([account.signInMethods(), account.passkeys(), account.linkedProviders(), mcp ? account.connectedApps() : []]).then(
      ([methods, passkeys, linked, apps]) => setLoaded({ methods, passkeys, linked, apps }),
      (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : text('couldNotReadMethods')),
    )
  }, [account, mcp])
  useEffect(reload, [reload])

  // Each change reads the account again, so the page shows what the server now has.
  const thenReload = <T,>(change: Promise<T>) => change.then((result) => (reload(), result))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title={text('signInSecurity')} subtitle={email} />
      {loaded ? (
        <>
          <PasskeysSection
            rule={loaded.methods.policy.passkey}
            passkeys={loaded.passkeys}
            onAdd={() => thenReload(account.addPasskey())}
            onRename={(id, name) => thenReload(account.renamePasskey(id, name))}
            onRemove={(id) => thenReload(account.removePasskey(id))}
          />
          <TwoFactorSection
            rule={loaded.methods.policy.twoFactor}
            enabled={loaded.methods.account.twoFactor}
            authenticatorApp={loaded.methods.account.authenticatorApp}
            mail={loaded.methods.mail}
            needsPassword={loaded.methods.account.password}
            onStartApp={(password) => account.startAuthenticatorApp(password)}
            onConfirmApp={(code) => account.confirmAuthenticatorApp(code)}
            onEmailedCodes={(password) => account.turnOnEmailedCodes(password)}
            onTurnOff={(password) => account.turnOffTwoFactor(password)}
            onNewBackupCodes={(password) => account.newBackupCodes(password)}
            onChanged={reload}
          />
          {linkable.length > 0 && (
            <SignInProvidersSection
              providers={linkable}
              linked={loaded.linked}
              onConnect={linkProvider}
              error={linkError && providerMessage(linkError, linkable.length === 1 ? linkable[0]!.name : text('theProvider'))}
            />
          )}
          {mcp && <ConnectedAppsSection apps={loaded.apps} onDisconnect={(clientId) => thenReload(account.disconnectApp(clientId))} />}
        </>
      ) : error ? (
        <p role="alert" className="text-danger-text">
          {error}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner /> {text('loading')}
        </div>
      )}
    </div>
  )
}
