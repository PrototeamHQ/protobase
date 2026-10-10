import { useEffect, useState } from 'react'
import { AuthError, type AccountSignIn, type RequiredSetup } from '@protobase/client'
import { Spinner } from '../primitives/spinner'
import { authMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { SetupRequiredForm } from './setup-required-form'

/** Sets up what the sign-in policy requires, one thing at a time, then reads the account again to open the app. */
export const SetupRequiredPage = ({ missing }: { missing: RequiredSetup[] }) => {
  const { session, recheck, signOut } = useAuth()
  const [methods, setMethods] = useState<AccountSignIn>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    void session.account.signInMethods().then(setMethods, (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : 'Could not read your account'))
  }, [session])

  const addPasskey = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await session.account.addPasskey()
      recheck()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
      setBusy(false)
    }
  }

  if (!methods && !error) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <Spinner /> Loading
      </div>
    )
  }
  return (
    <SetupRequiredForm
      step={missing[0]!}
      busy={busy}
      error={error}
      onAddPasskey={() => void addPasskey()}
      onSignOut={() => void signOut()}
      twoFactor={{
        offerEmailedCodes: methods?.mail ?? false,
        needsPassword: methods?.account.password ?? true,
        onStartApp: (password) => session.account.startAuthenticatorApp(password),
        onConfirmApp: (code) => session.account.confirmAuthenticatorApp(code),
        onEmailedCodes: (password) => session.account.turnOnEmailedCodes(password),
        onDone: recheck,
      }}
    />
  )
}
