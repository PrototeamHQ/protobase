import { AccountSection, SectionError } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth/auth-provider'
import { isAdmin } from '../auth/user-to-shell'
import { AllOrganizations } from './all-organizations'
import { MyInvitationRow } from './my-invitation-row'
import { NewOrganizationForm } from './new-organization-form'
import { OrganizationRow } from './organization-row'
import { useOrganizationText } from './organization-word'
import { useAction } from './use-action'
import { useMyInvitations } from './use-my-invitations'
import { reopenIn, type OrganizationsState } from './use-organizations'

/** The invitations for the person's own address, each to join, which opens the app in its organization. */
const YourInvitations = ({ basePath }: { basePath: string }) => {
  const { session } = useAuth()
  const t = useOrganizationText()
  const invitations = useMyInvitations()
  const { busy, error, run } = useAction()
  if (!invitations || invitations.length === 0) return null
  return (
    <AccountSection title={t('invitationsForYou')} description={t('invitationsForYouDescription')}>
      <SectionError message={error} />
      <ul className="divide-y rounded-md border">
        {invitations.map((invitation) => (
          <MyInvitationRow key={invitation.id} invitation={invitation} t={t} busy={busy} onJoin={() => void run(async () => { await session.organizations.acceptMine(invitation.id); reopenIn(basePath) })} />
        ))}
      </ul>
    </AccountSection>
  )
}

/**
 * The person's organizations: switching between them, making a new one when the app allows it, and for people with a
 * global role every organization. Someone in none sees their invitations here.
 */
export const OrganizationsPage = ({ state, basePath }: { state: OrganizationsState; basePath: string }) => {
  const { session, organizations: settings, state: auth } = useAuth()
  const t = useOrganizationText()
  const { busy, error, run } = useAction()
  const user = auth.kind === 'signed-in' ? auth.user : undefined
  const mayCreate = settings?.create === 'everyone' || (user !== undefined && isAdmin(user))
  const currentId = state.current?.organization?.id
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title={t('organizations')} subtitle={t('organizationsSubtitle')} />
      <AccountSection title={t('yourOrganizations')} description={state.organizations.length > 0 ? t('memberOf') : t('notMember')}>
        <SectionError message={error ?? state.error} />
        {state.organizations.length > 0 && (
          <ul className="divide-y rounded-md border">
            {state.organizations.map((organization) => (
              <OrganizationRow key={organization.id} organization={organization} current={organization.id === currentId} busy={busy} onOpen={() => void run(async () => { await session.organizations.switchTo(organization.id); reopenIn(basePath) })} />
            ))}
          </ul>
        )}
      </AccountSection>
      <YourInvitations basePath={basePath} />
      {mayCreate && (
        <AccountSection title={t('newOrganization')} description={t('newOrganizationDescription')}>
          <NewOrganizationForm onCreated={() => reopenIn(basePath)} />
        </AccountSection>
      )}
      {(state.current?.globalRoles.length ?? 0) > 0 && <AllOrganizations basePath={basePath} currentId={currentId} />}
    </div>
  )
}
