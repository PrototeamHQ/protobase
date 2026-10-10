import { useEffect, useState } from 'react'
import { AuthError, type InvitationPreview } from '@protobase/client'
import { AuthLayout } from '../auth/auth-layout'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { minPasswordLength } from '../auth/reset-password-form'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { Spinner } from '../primitives/spinner'
import { organizationRoleLabels, roleLabel } from './organization-paths'
import { useAction } from './use-action'

export type InvitationPageProps = {
  token: string
  /** The person is a member now, and signed in: on to the app. */
  onDone: () => void
  /** Someone with an account signs in first, then comes back here to accept. */
  onSignIn: () => void
}

const SignUp = ({ token, preview, onDone }: { token: string; preview: InvitationPreview; onDone: () => void }) => {
  const { session, signInMethods, recheck } = useAuth()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAction()
  const withPassword = signInMethods.includes('password')
  const passwordOptional = signInMethods.includes('emailCode')
  const submit = () =>
    run(async () => {
      await session.organizations.signUpFromInvitation(token, { name: name.trim(), ...(withPassword && password && { password }) })
      onDone()
      recheck()
    })
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p className="text-[13px] text-muted-foreground">Make your account for {preview.email} to join.</p>
      {error && <p role="alert" className="text-xs font-medium text-danger-text">{error}</p>}
      <Input aria-label="Your name" placeholder="Your name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
      {withPassword && (
        <Input
          aria-label="Password"
          type="password"
          autoComplete="new-password"
          placeholder={passwordOptional ? `Password (optional, ${minPasswordLength}+ characters)` : `Password (${minPasswordLength}+ characters)`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      )}
      <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || (withPassword && !passwordOptional && password.length < minPasswordLength)}>
        Create account and join
      </Button>
    </form>
  )
}

/**
 * Where an emailed invitation link leads: what it is for, then accepting it signed in as the invited address, signing
 * in first, or making an account for an address without one.
 */
export const InvitationPage = ({ token, onDone, onSignIn }: InvitationPageProps) => {
  const { session, state, signOut, organizations } = useAuth()
  const [preview, setPreview] = useState<InvitationPreview>()
  const [invalid, setInvalid] = useState<string>()
  const { busy, error, run } = useAction()
  useEffect(() => {
    void session.organizations.invitation(token).then(setPreview, (failure: unknown) => setInvalid(failure instanceof AuthError ? authMessage(failure) : 'This invitation link is not valid'))
  }, [session, token])

  if (invalid) {
    return (
      <AuthLayout title="Invitation" description={invalid}>
        <Button className="w-full" onClick={onDone}>Go to the app</Button>
      </AuthLayout>
    )
  }
  if (!preview) {
    return (
      <AuthLayout title="Invitation">
        <div className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground"><Spinner /> Loading</div>
      </AuthLayout>
    )
  }
  const roles = preview.appRoles.map((name) => roleLabel(organizations?.roles ?? [], name))
  const description = `${preview.inviter.name} invites you to ${preview.organization.name} as ${organizationRoleLabels[preview.role].toLowerCase()}${roles.length > 0 ? `, with ${roles.join(', ')}` : ''}.`
  const user = state.kind === 'signed-in' ? state.user : undefined

  if (user && user.email.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <AuthLayout title={`Join ${preview.organization.name}`} description={description}>
        <p className="mb-3 text-[13px] text-muted-foreground">This invitation is for {preview.email}, and you are signed in as {user.email}.</p>
        <Button className="w-full" onClick={() => void signOut()}>Sign out to accept it</Button>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title={`Join ${preview.organization.name}`} description={description}>
      {user ? (
        <div className="flex flex-col gap-3">
          {error && <p role="alert" className="text-xs font-medium text-danger-text">{error}</p>}
          <Button variant="primary" className="w-full" loading={busy} onClick={() => void run(async () => { await session.organizations.accept(token); onDone() })}>
            Join {preview.organization.name}
          </Button>
        </div>
      ) : preview.hasAccount ? (
        <Button variant="primary" className="w-full" onClick={onSignIn}>Sign in as {preview.email} to join</Button>
      ) : (
        <SignUp token={token} preview={preview} onDone={onDone} />
      )}
    </AuthLayout>
  )
}
