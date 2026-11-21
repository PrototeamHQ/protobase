import type { ReactNode } from 'react'
import { AuthLayout } from '../auth/auth-layout'
import { useAuth } from '../auth/auth-provider'
import { SectionError } from '../account/account-section'
import { Link } from '../app/router'
import { Button } from '../primitives/button'
import { MyInvitationRow } from './my-invitation-row'
import { NewOrganizationForm } from './new-organization-form'
import { firstOrganizationFormPath, firstOrganizationPath, organizationsPath } from './organization-paths'
import { useOrganizationText } from './organization-word'
import { useAction } from './use-action'
import { useMyInvitations } from './use-my-invitations'
import { reopenIn } from './use-organizations'

export type FirstOrganizationPageProps = {
  /** The screen's own address: the form alone below the invitations at `firstOrganizationFormPath`. */
  path: string
  basePath: string
  /** The address the person is signed in as. */
  email: string
  /** Whether they may create an organization (`organizations.create`). */
  mayCreate: boolean
  /** Whether a global role lets them work in any organization, which the organizations page lists. */
  seesAll: boolean
  /** Signs out, asking first. */
  onSignOut: () => void
}

// As the sign-in screens' own links and buttons beside their form.
const linkClass = 'font-medium text-primary-text hover:underline'

// Who is signed in, and the way out, under the card's content.
const SignedInAs = ({ email, onSignOut, children }: { email: string; onSignOut: () => void; children?: ReactNode }) => {
  const t = useOrganizationText()
  return (
    <div className="mt-5 flex flex-col gap-2 border-t pt-4 text-center text-muted-foreground">
      {children}
      <p className="break-words">{t('signedInAs', { email })}</p>
      <button type="button" onClick={onSignOut} className="self-center font-medium text-muted-foreground hover:text-foreground hover:underline">{t('signOut')}</button>
    </div>
  )
}

/**
 * Where someone signed in without an organization starts: their pending invitations first, each joined in one press,
 * with a way to create one of their own instead; without invitations, the one field that names it. Joining or creating
 * opens the app afresh at its start address. Someone who may not create and has no invitation is told to ask for one.
 */
export const FirstOrganizationPage = ({ path, basePath, email, mayCreate, seesAll, onSignOut }: FirstOrganizationPageProps) => {
  const { session, organizations: settings } = useAuth()
  const t = useOrganizationText()
  const read = useMyInvitations()
  const { busy, error, run } = useAction()
  const opened = () => reopenIn(basePath)
  const all = seesAll && <Link to={organizationsPath} className={linkClass}>{t('allOrganizations')}</Link>
  const footer = <SignedInAs email={email} onSignOut={onSignOut}>{all}</SignedInAs>

  // Blank for the moment the invitations take, rather than a title that may change to the invitations' own
  if (read.state === 'loading') return <div className="min-h-full" aria-busy />
  // A failed read never falls back to the form: someone invited would make an empty organization instead of joining
  if (read.state === 'failed') {
    return (
      <AuthLayout title={t('invitationsNotLoaded')} description={t('invitationsNotLoadedHelp')}>
        <Button variant="primary" className="min-h-10 w-full" onClick={read.retry}>{t('tryAgain')}</Button>
        {footer}
      </AuthLayout>
    )
  }
  const invitations = read.invitations
  // The form's own address shows the form, when they may create one; otherwise their invitations stay the way in
  if (invitations.length > 0 && (path !== firstOrganizationFormPath || !mayCreate)) {
    return (
      <AuthLayout title={t('invitedTitle')} description={mayCreate ? t('invitedSubtitle') : t('invitedSubtitleJoinOnly')}>
        <SectionError message={error} />
        <ul className="divide-y rounded-md border">
          {invitations.map((invitation) => (
            <MyInvitationRow key={invitation.id} invitation={invitation} t={t} busy={busy} onJoin={() => void run(async () => { await session.organizations.acceptMine(invitation.id); opened() })} />
          ))}
        </ul>
        {mayCreate && (
          <p className="mt-4 text-center">
            <Link to={firstOrganizationFormPath} className={linkClass}>{t('createInstead')}</Link>
          </p>
        )}
        {footer}
      </AuthLayout>
    )
  }
  if (!mayCreate) {
    return (
      <AuthLayout title={t('notInAnyTitle')} description={t('notInAny', { email })}>
        {footer}
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title={t('createTitle')} {...(settings?.createDescription && { description: settings.createDescription })}>
      <NewOrganizationForm autoFocus onCreated={opened} />
      {invitations.length > 0 && (
        <p className="mt-4 text-center">
          <Link to={firstOrganizationPath} className={linkClass}>{t('backToInvitations')}</Link>
        </p>
      )}
      {footer}
    </AuthLayout>
  )
}
