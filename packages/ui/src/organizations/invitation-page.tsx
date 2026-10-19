import { useEffect, useState } from 'react'
import { AuthError, type InvitationPreview } from '@protobase/client'
import { AuthLayout } from '../auth/auth-layout'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { minPasswordLength } from '../auth/reset-password-form'
import { cn } from '../lib/cn'
import { Button, buttonClass } from '../primitives/button'
import { Input } from '../primitives/input'
import { RouteLink, type RouteTarget } from '../primitives/route-link'
import { Spinner } from '../primitives/spinner'
import { organizationRoleLabel, roleLabel } from './organization-paths'
import { useAction } from './use-action'
import { text } from './messages'

export type InvitationPageProps = {
  token: string
  /** The person is a member now, and signed in: on to the app. */
  onDone: () => void
  /** Someone with an account signs in first, then comes back here to accept. */
  signIn: RouteTarget
}

const SignUp = ({ token, preview, joins, onDone }: { token: string; preview: InvitationPreview; joins: boolean; onDone: () => void }) => {
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
      <p className="text-muted-foreground">{joins ? text('makeAccountToJoin', preview.email) : text('makeAccount', preview.email)}</p>
      {error && <p role="alert" className="text-body font-medium text-danger-text">{error}</p>}
      <Input aria-label={text('yourName')} placeholder={text('yourName')} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
      {withPassword && (
        <Input
          aria-label={text('password')}
          type="password"
          autoComplete="new-password"
          placeholder={passwordOptional ? text('passwordOptional', minPasswordLength) : text('passwordRequired', minPasswordLength)}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      )}
      <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || (withPassword && !passwordOptional && password.length < minPasswordLength)}>
        {joins ? text('createAndJoin') : text('createYourAccount')}
      </Button>
    </form>
  )
}

/**
 * Where an emailed invitation link leads: what it is for, then accepting it signed in as the invited address, signing
 * in first, or making an account for an address without one. An invitation to the app itself, rather than to an
 * organization, only makes the account: someone with one just signs in.
 */
export const InvitationPage = ({ token, onDone, signIn }: InvitationPageProps) => {
  const { session, state, signOut, organizations } = useAuth()
  const [preview, setPreview] = useState<InvitationPreview>()
  const [invalid, setInvalid] = useState<string>()
  const { busy, error, run } = useAction()
  useEffect(() => {
    void session.organizations.invitation(token).then(setPreview, (failure: unknown) => setInvalid(failure instanceof AuthError ? authMessage(failure) : text('invalidLink')))
  }, [session, token])

  if (invalid) {
    return (
      <AuthLayout title={text('invitation')} description={invalid}>
        <Button className="w-full" onClick={onDone}>{text('goToApp')}</Button>
      </AuthLayout>
    )
  }
  if (!preview) {
    return (
      <AuthLayout title={text('invitation')}>
        <div className="flex items-center justify-center gap-2 text-muted-foreground"><Spinner /> {text('loading')}</div>
      </AuthLayout>
    )
  }
  const user = state.kind === 'signed-in' ? state.user : undefined
  const sameAddress = user?.email.toLowerCase() === preview.email.toLowerCase()
  if (!preview.organization) {
    const app = preview.app?.name ?? ''
    const description = text('invitesToApp', preview.inviter.name, app)
    return (
      <AuthLayout title={text('join', app)} description={description}>
        {preview.hasAccount ? (
          user && sameAddress ? (
            <Button variant="primary" className="w-full" onClick={onDone}>{text('goToApp')}</Button>
          ) : (
            <>
              <p className="mb-3 text-muted-foreground">{text('hasAccount', preview.email)}</p>
              {user ? <Button className="w-full" onClick={() => void signOut()}>{text('signOut')}</Button> : <RouteLink to={signIn} className={cn(buttonClass({ variant: 'primary' }), 'w-full')}>{text('signInAs', preview.email)}</RouteLink>}
            </>
          )
        ) : user ? (
          <>
            <p className="mb-3 text-muted-foreground">{text('otherAddress', preview.email, user.email)}</p>
            <Button className="w-full" onClick={() => void signOut()}>{text('signOutToAccept')}</Button>
          </>
        ) : (
          <SignUp token={token} preview={preview} joins={false} onDone={onDone} />
        )}
      </AuthLayout>
    )
  }
  const organization = preview.organization
  const roles = preview.appRoles.map((name) => roleLabel(organizations?.roles ?? [], name))
  const role = organizationRoleLabel(preview.role!).toLowerCase()
  const description = roles.length > 0 ? text('invitesToWith', preview.inviter.name, organization.name, role, roles.join(', ')) : text('invitesTo', preview.inviter.name, organization.name, role)

  if (user && !sameAddress) {
    return (
      <AuthLayout title={text('join', organization.name)} description={description}>
        <p className="mb-3 text-muted-foreground">{text('otherAddress', preview.email, user.email)}</p>
        <Button className="w-full" onClick={() => void signOut()}>{text('signOutToAccept')}</Button>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title={text('join', organization.name)} description={description}>
      {user ? (
        <div className="flex flex-col gap-3">
          {error && <p role="alert" className="text-body font-medium text-danger-text">{error}</p>}
          <Button variant="primary" className="w-full" loading={busy} onClick={() => void run(async () => { await session.organizations.accept(token); onDone() })}>
            {text('join', organization.name)}
          </Button>
        </div>
      ) : preview.hasAccount ? (
        <RouteLink to={signIn} className={cn(buttonClass({ variant: 'primary' }), 'w-full')}>{text('signInAsToJoin', preview.email)}</RouteLink>
      ) : (
        <SignUp token={token} preview={preview} joins onDone={onDone} />
      )}
    </AuthLayout>
  )
}
