import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { createStaticSession, type AuthSession } from '@protobase/client'
import { ProfileMenu, type ProfileRoles } from '../app-shell/profile-menu'
import { App } from '../app/app'
import { fakeClient } from '../app/testing/fake-client'

const meta = { title: 'Roles' } satisfies Meta
export default meta

const user = { name: 'Sanne de Vries', email: 'sanne@acme.example', initials: 'SV', hue: 200, role: 'Sales', roleTone: 'blue' } as const
const held = [
  { name: 'admin', label: 'Admin' },
  { name: 'sales', label: 'Sales' },
  { name: 'accountant', label: 'Accountant' },
]

const Menu = ({ roles }: { roles: ProfileRoles }) => (
  <div className="flex h-96 items-end p-4">
    <div className="w-60">
      <ProfileMenu user={user} compact={false} open roles={roles} />
    </div>
  </div>
)

/** The roles in the profile menu: the one the session acts with checked, the person's others a click away. */
export const ProfileMenuSwitcher: StoryObj<{ onSwitch: (name: string) => void }> = {
  tags: ['play'],
  args: { onSwitch: fn() },
  render: (args) => <Menu roles={{ active: 'sales', roles: held, onSwitch: args.onSwitch }} />,
  play: async ({ canvasElement, args }) => {
    const group = within(within(canvasElement).getByRole('group', { name: 'Roles' }))
    expect(group.getByText('Sales').closest('[aria-current]')).toHaveAttribute('aria-current', 'true')
    expect(group.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Admin', 'Accountant'])
    await userEvent.click(group.getByRole('menuitem', { name: 'Accountant' }))
    expect(args.onSwitch).toHaveBeenCalledWith('accountant')
  },
}

/** Someone with one role has nothing to switch to, so the menu leaves the roles out. */
export const SingleRole: StoryObj = {
  tags: ['play'],
  render: () => <Menu roles={{ active: 'sales', roles: [{ name: 'sales', label: 'Sales' }], onSwitch: fn() }} />,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('group', { name: 'Roles' })).toBeNull()
  },
}

const actingAsSales = (): AuthSession => {
  const session = createStaticSession('story-token', { id: 'sanne', email: 'sanne@acme.example', name: 'Sanne', role: 'admin,sales' })
  return { ...session, roles: { current: async () => ({ active: 'sales', roles: held.slice(0, 2) }), switchTo: fn(async () => undefined) } }
}

/** An admin acting as sales: the shell shows the sales role and leaves out what only an admin may open. */
export const ActingWithAnotherRole: StoryObj = {
  tags: ['play'],
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: { create: true, update: true, delete: true, conditional: [] } })} auth={actingAsSales()} initialUrl="/orders" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Profile menu' }))
    const menu = await canvas.findByRole('menu')
    expect(await within(menu).findByRole('group', { name: 'Roles' })).toBeVisible()
    expect(within(menu).getByRole('menuitem', { name: 'Admin' })).toBeVisible()
    expect(within(menu).queryByRole('menuitem', { name: 'Sign-in policy' })).toBeNull()
  },
}
