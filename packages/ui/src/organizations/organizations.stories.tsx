import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type CurrentOrganization, type OrganizationMember, type RoleLabel } from '@protobase/client'
import { ProfileMenu } from '../app-shell/profile-menu'
import { AuthProvider } from '../auth/auth-provider'
import { InvitationPage } from './invitation-page'
import { InvitationsPage } from './invitations-page'
import { MembersPage } from './members-page'
import { OrganizationsPage } from './organizations-page'

const meta = { title: 'Organizations', decorators: [(Story) => <div className="bg-surface"><Story /></div>] } satisfies Meta
export default meta

const roles: RoleLabel[] = [
  { name: 'admin', label: 'Superuser', membership: false, grants: [] },
  { name: 'support', label: 'Support', membership: true, grants: [] },
  { name: 'manager', label: 'Manager', membership: true, grants: ['accountant'] },
  { name: 'sales', label: 'Sales', membership: true, grants: [] },
  { name: 'accountant', label: 'Accountant', membership: true, grants: [] },
  { name: 'user', label: 'No global role', membership: false, grants: [] },
]

const acme = { id: 'org-acme', name: 'Acme', slug: 'acme', logo: null }

const members: OrganizationMember[] = [
  { id: 'm-bo', userId: 'u-bo', name: 'Bo Jansen', email: 'bo@acme.example', role: 'owner', appRoles: ['manager', 'sales', 'accountant'], createdAt: '2026-09-01T09:00:00.000Z' },
  { id: 'm-sanne', userId: 'u-sanne', name: 'Sanne de Vries', email: 'sanne@acme.example', role: 'admin', appRoles: ['sales'], createdAt: '2026-09-03T09:00:00.000Z' },
  { id: 'm-jan', userId: 'u-jan', name: 'Jan Smit', email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'], createdAt: '2026-09-20T09:00:00.000Z' },
]

type Organizations = AuthSession['organizations']

/** A signed-in session of an app with organizations, its organization calls replaced by `organizations`. */
const sessionWith = (organizations: Partial<Organizations>): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-sanne', email: 'sanne@acme.example', name: 'Sanne de Vries', role: 'user' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), organizations: { create: 'everyone', roles } }),
    organizations: { ...base.organizations, ...organizations },
  }
}

const WithSession = ({ session, children }: { session: AuthSession; children: ReactNode }) => <AuthProvider session={session}>{children}</AuthProvider>

// Sanne is an admin of Acme holding Sales; Manager would also let her give Accountant.
const sanneAsAdmin: CurrentOrganization = { organization: acme, role: 'admin', appRoles: ['sales'], memberId: 'm-sanne', globalRoles: [] }

type MembersArgs = { setAppRoles: Organizations['setAppRoles'] }

/** An admin holding only Sales: she can give and take Sales, and the other app roles show as they are. */
export const MembersWithLimitedRoles: StoryObj<MembersArgs> = {
  tags: ['play'],
  args: { setAppRoles: fn(async () => undefined) },
  render: (args) => (
    <WithSession session={sessionWith({ members: async () => members, setAppRoles: args.setAppRoles })}>
      <MembersPage current={sanneAsAdmin} />
    </WithSession>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Jan Smit')
    const jan = within(canvas.getByText('Jan Smit').closest('li')!)
    expect(jan.getByRole('checkbox', { name: 'Accountant' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(jan.getByRole('checkbox', { name: 'Accountant' }))
    expect(args.setAppRoles).not.toHaveBeenCalled()
    await userEvent.click(jan.getByRole('checkbox', { name: 'Sales' }))
    expect(args.setAppRoles).toHaveBeenCalledWith('m-jan', ['accountant', 'sales'])
    // Only an owner changes an owner
    const bo = within(canvas.getByText('Bo Jansen').closest('li')!)
    expect(bo.getByRole('combobox', { name: 'Organization role of Bo Jansen' })).toBeDisabled()
  },
}

type InviteArgs = { invite: Organizations['invite'] }

/** Inviting someone as a manager's grant allows: Accountant, which she does not hold herself. Without mail the link shows. */
export const InviteWithGrantedRole: StoryObj<InviteArgs> = {
  tags: ['play'],
  args: {
    invite: fn(async (_organizationId: string, input: { email: string }) => ({
      invitation: { id: 'i1', email: input.email, role: 'member' as const, appRoles: ['accountant'], status: 'pending', expiresAt: '2026-10-17T09:00:00.000Z' },
      link: 'https://erp.example.com/-/invitation?token=i1.signature',
    })),
  },
  render: (args) => (
    <WithSession session={sessionWith({ invitations: async () => [], invite: args.invite })}>
      <InvitationsPage current={{ ...sanneAsAdmin, appRoles: ['manager'] }} />
    </WithSession>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByLabelText('Email'), 'jan@ledger.example')
    expect(canvas.getByRole('checkbox', { name: 'Sales' })).toHaveClass('opacity-60')
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Accountant' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Invite' }))
    expect(args.invite).toHaveBeenCalledWith('org-acme', { email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'] })
    await canvas.findByText('https://erp.example.com/-/invitation?token=i1.signature')
  },
}

type InvitationArgs = { signUpFromInvitation: Organizations['signUpFromInvitation'] }

/** The page an invitation link opens for an address without an account: making one joins the organization. */
export const InvitationForANewAccount: StoryObj<InvitationArgs> = {
  tags: ['play'],
  args: { signUpFromInvitation: fn(async () => undefined) },
  render: (args) => {
    const session = sessionWith({
      invitation: async () => ({ organization: { id: 'org-acme', name: 'Acme' }, inviter: { name: 'Bo Jansen' }, email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'], expiresAt: '2026-10-17T09:00:00.000Z', hasAccount: false }),
      signUpFromInvitation: args.signUpFromInvitation,
    })
    // Signed out, as someone opening the link for the first time is.
    return (
      <WithSession session={{ ...session, session: async () => undefined }}>
        <div className="h-screen"><InvitationPage token="i1.signature" onDone={fn()} onSignIn={fn()} /></div>
      </WithSession>
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Join Acme' })).toBeVisible()
    expect(canvas.getByText('Bo Jansen invites you to Acme as member, with Accountant.')).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Your name'), 'Jan Smit')
    await userEvent.type(canvas.getByLabelText('Password'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Create account and join' }))
    expect(args.signUpFromInvitation).toHaveBeenCalledWith('i1.signature', { name: 'Jan Smit', password: 'correct horse battery' })
  },
}

/** Someone with a global role finds any organization to work in. */
export const FindAnyOrganization: StoryObj<{ search: Organizations['search'] }> = {
  tags: ['play'],
  args: { search: fn(async (query: string) => [{ id: 'org-globex', name: 'Globex', slug: 'globex' }].filter((organization) => organization.name.toLowerCase().includes(query.toLowerCase()))) },
  render: (args) => (
    <WithSession session={sessionWith({ search: args.search })}>
      <OrganizationsPage basePath="" state={{ organizations: [], current: { organization: null, globalRoles: ['support'] }, reload: fn() }} />
    </WithSession>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('You are not a member of an organization yet.')).toBeVisible()
    await userEvent.type(canvas.getByRole('textbox', { name: 'Find an organization' }), 'glo')
    await waitFor(() => expect(args.search).toHaveBeenLastCalledWith('glo'))
    expect(await canvas.findByText('Globex')).toBeVisible()
  },
}

/** The organizations in the profile menu: the current one marked, the others a click away. */
export const ProfileMenuSwitcher: StoryObj<{ onSwitch: (id: string) => void }> = {
  tags: ['play'],
  args: { onSwitch: fn() },
  render: (args) => (
    <div className="flex h-96 items-end p-4">
      <div className="w-60">
        <ProfileMenu
          user={{ name: 'Sanne de Vries', email: 'sanne@acme.example', initials: 'SV', hue: 200, role: 'Admin', roleTone: 'violet' }}
          compact={false}
          open
          organizations={{ current: { id: 'org-acme', name: 'Acme' }, others: [{ id: 'org-globex', name: 'Globex' }], onSwitch: args.onSwitch }}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(within(canvas.getByRole('group', { name: 'Organizations' })).getByText('Acme')).toBeVisible()
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Globex' }))
    expect(args.onSwitch).toHaveBeenCalledWith('org-globex')
  },
}
