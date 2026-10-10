import { useCallback, useEffect, useState } from 'react'
import { AuthError, type AccountSignIn, type Passkey } from '@protobase/client'
import { PageHeader } from '../app-shell'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { Spinner } from '../primitives/spinner'
import { PasskeysSection } from './passkeys-section'
import { TwoFactorSection } from './two-factor-section'

type Loaded = { methods: AccountSignIn; passkeys: Passkey[] }

/** The signed-in person's passkeys and two-factor authentication, within what the sign-in policy allows. */
export const AccountSecurityPage = ({ email }: { email: string }) => {
  const { session } = useAuth()
  const { account } = session
  const [loaded, setLoaded] = useState<Loaded>()
  const [error, setError] = useState<string>()

  const reload = useCallback(() => {
    void Promise.all([account.signInMethods(), account.passkeys()]).then(
      ([methods, passkeys]) => setLoaded({ methods, passkeys }),
      (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : 'Could not read your sign-in methods'),
    )
  }, [account])
  useEffect(reload, [reload])

  // Each change reads the account again, so the page shows what the server now has.
  const thenReload = <T,>(change: Promise<T>) => change.then((result) => (reload(), result))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title="Sign-in & security" subtitle={email} />
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
        </>
      ) : error ? (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Spinner /> Loading
        </div>
      )}
    </div>
  )
}
