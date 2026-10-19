import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { createStaticSession, type AppUser, type AuthSession, type RoleLabel, type UserInvitation } from '@protobase/client'
import { AuthProvider } from '../auth/auth-provider'
import { InvitationPage } from '../organizations/invitation-page'
import { UsersBlock } from './users-block'

const meta = { title: 'Users', decorators: [(Story) => <div className="bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const roles: RoleLabel[] = [
  { name: 'admin', label: 'Superuser', membership: false, grants: [] },
  { name: 'sales', label: 'Sales', membership: false, grants: [] },
  { name: 'warehouse', label: 'Warehouse', membership: false, grants: [] },
]

const everyone: AppUser[] = [
  { id: 'u-root', name: 'Root', email: 'root@shop.example', roles: ['admin'], blocked: false, createdAt: '2026-09-01T09:00:00.000Z' },
  { id: 'u-ana', name: 'Ana de Vries', email: 'ana@shop.example', roles: ['sales'], blocked: false, createdAt: '2026-09-03T09:00:00.000Z' },
  { id: 'u-bo', name: 'Bo Jansen', email: 'bo@shop.example', roles: ['warehouse'], blocked: true, createdAt: '2026-09-20T09:00:00.000Z' },
]

const pending: UserInvitation[] = [{ id: 'i-cy', email: 'cy@shop.example', roles: ['sales', 'warehouse'], expiresAt: '2099-10-17T09:00:00.000Z' }]

type Users = AuthSession['users']

/** An admin's session of an app without organizations, its user calls replaced by `users`. */
const sessionWith = (users: Partial<Users>): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-root', email: 'root@shop.example', name: 'Root', role: 'admin' })
  return {
    ...base,
    users: {
      ...base.users,
      roles: async () => roles,
      search: async (query: string) => {
        const found = everyone.filter((user) => user.email.includes(query))
        return { users: found, total: found.length }
      },
      invitations: async () => pending,
      ...users,
    },
  }
}

type Args = { block: Users['block']; setRoles: Users['setRoles']; create: Users['create']; invite: Users['invite'] }

/** An admin sees everyone, blocks someone, changes roles, adds an account and invites someone; without mail the link shows. */
export const ManageUsers: StoryObj<Args> = {
  tags: ['play'],
  args: {
    block: fn(async () => undefined),
    setRoles: fn(async () => undefined),
    create: fn(async (input: { email: string; name: string; roles: string[] }) => ({ id: 'u-new', name: input.name, email: input.email, roles: input.roles, blocked: false, createdAt: '2026-10-19T09:00:00.000Z' })),
    invite: fn(async (input: { email: string; roles: string[] }) => ({
      invitation: { id: 'i-new', email: input.email, roles: input.roles, expiresAt: '2099-10-26T09:00:00.000Z' },
      link: 'https://shop.example.com/-/invitation?token=i-new.signature',
    })),
  },
  render: (args) => (
    <AuthProvider session={sessionWith(args)}>
      <UsersBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const people = within(await canvas.findByRole('region', { name: 'People' }))
    expect(await people.findByText('3 of 3')).toBeVisible()
    expect(people.getByText('Root (you)')).toBeVisible()

    // Nobody blocks themselves; someone blocked shows it, with Unblock.
    const root = within(people.getByText('Root (you)').closest('li')!)
    expect(root.queryByRole('button', { name: 'Block' })).toBeNull()
    const bo = within(people.getByText('Bo Jansen').closest('li')!)
    expect(bo.getByText('Blocked')).toBeVisible()
    expect(bo.getByRole('button', { name: 'Unblock' })).toBeVisible()

    const ana = within(people.getByText('Ana de Vries').closest('li')!)
    await userEvent.click(ana.getByRole('button', { name: 'Block' }))
    expect(args.block).toHaveBeenCalledWith('u-ana')
    expect(await ana.findByText('Blocked')).toBeVisible()
    await userEvent.click(ana.getByRole('checkbox', { name: 'Warehouse' }))
    expect(args.setRoles).toHaveBeenCalledWith('u-ana', ['sales', 'warehouse'])

    // Pending invitations name their roles by label.
    const waiting = within(canvas.getByRole('region', { name: 'Not accepted yet' }))
    expect(await waiting.findByText('cy@shop.example')).toBeVisible()
    expect(waiting.getByText(/^Sales, Warehouse · Until/)).toBeVisible()

    const invite = within(canvas.getByRole('region', { name: 'Invite someone' }))
    await userEvent.type(invite.getByLabelText('Email'), 'dee@shop.example')
    expect(invite.getByRole('button', { name: 'Invite' })).toBeDisabled()
    await userEvent.click(invite.getByRole('checkbox', { name: 'Sales' }))
    await userEvent.click(invite.getByRole('button', { name: 'Invite' }))
    expect(args.invite).toHaveBeenCalledWith({ email: 'dee@shop.example', roles: ['sales'] })
    expect(await invite.findByText('https://shop.example.com/-/invitation?token=i-new.signature')).toBeVisible()

    const add = within(canvas.getByRole('region', { name: 'Add an account' }))
    await userEvent.type(add.getByLabelText('Email'), 'review@shop.example')
    await userEvent.type(add.getByLabelText('Name'), 'Reviewer')
    await userEvent.click(add.getByRole('checkbox', { name: 'Sales' }))
    await userEvent.click(add.getByRole('button', { name: 'Add account' }))
    expect(args.create).toHaveBeenCalledWith({ email: 'review@shop.example', name: 'Reviewer', roles: ['sales'] })
  },
}

type InvitationArgs = { signUpFromInvitation: AuthSession['organizations']['signUpFromInvitation'] }

/** The page an invitation to the app opens for an address without an account: it makes the account, with no organization to join. */
export const AppInvitationForANewAccount: StoryObj<InvitationArgs> = {
  tags: ['play'],
  args: { signUpFromInvitation: fn(async () => undefined) },
  render: (args) => {
    const base = sessionWith({})
    const session: AuthSession = {
      ...base,
      // Signed out, as someone opening the link for the first time is.
      session: async () => undefined,
      organizations: {
        ...base.organizations,
        invitation: async () => ({ app: { name: 'Shop' }, inviter: { name: 'Root' }, email: 'dee@shop.example', appRoles: ['sales'], expiresAt: '2099-10-26T09:00:00.000Z', hasAccount: false }),
        signUpFromInvitation: args.signUpFromInvitation,
      },
    }
    return (
      <AuthProvider session={session}>
        <div className="h-screen"><InvitationPage token="i-new.signature" onDone={fn()} signIn={{ href: '/-/sign-in', onFollow: fn() }} /></div>
      </AuthProvider>
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Join Shop' })).toBeVisible()
    expect(canvas.getByText('Root invites you to join Shop.')).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Your name'), 'Dee')
    await userEvent.type(canvas.getByLabelText('Password'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Create your account' }))
    expect(args.signUpFromInvitation).toHaveBeenCalledWith('i-new.signature', { name: 'Dee', password: 'correct horse battery' })
  },
}
