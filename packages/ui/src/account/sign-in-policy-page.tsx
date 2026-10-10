import { useEffect, useState } from 'react'
import { AuthError, type SignInPolicy, type SignInPolicyState, type StaffSignIn } from '@protobase/client'
import { PageHeader } from '../app-shell'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { Spinner } from '../primitives/spinner'
import { SignInPolicyForm } from './sign-in-policy-form'
import { StaffSignInLog } from './staff-sign-in-log'

const StaffSignIns = ({ operator }: { operator: string }) => {
  const { session } = useAuth()
  const [signIns, setSignIns] = useState<StaffSignIn[]>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    void session.staff.log().then(setSignIns, (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : 'Could not read the staff sign-ins'))
  }, [session])
  return <StaffSignInLog operator={operator} signIns={signIns} error={error} />
}

/**
 * The admin page for the sign-in policy; the server refuses a policy that would lock people out, and the page says why.
 * With an operator provider, the log of staff sign-ins follows the policy.
 */
export const SignInPolicyPage = () => {
  const { session } = useAuth()
  const [state, setState] = useState<SignInPolicyState>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    void session.signInPolicy.read().then(setState, (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : 'Could not read the sign-in policy'))
  }, [session])

  const save = async (policy: SignInPolicy) => {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      setState(await session.signInPolicy.save(policy))
      setNotice('Saved. It applies to every sign-in from now on.')
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title="Sign-in policy" subtitle="How people sign in to this app. Signed-in people keep their session, and are asked for what is newly required within 15 minutes." />
      {state ? (
        <>
          <SignInPolicyForm key={state.savedAt ?? 'default'} state={state} busy={busy} error={error} notice={notice} onSave={(policy) => void save(policy)} />
          {state.operator && <StaffSignIns operator={state.operator} />}
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
