import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AuthError, type DeviceLink, type DeviceSession } from '@protobase/client'
import { DevicesSection, type DevicesSectionProps } from './devices-section'

const meta = { title: 'Account devices', decorators: [(Story) => <div className="max-w-3xl bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const sessions: DeviceSession[] = [
  {
    token: 'iphone',
    current: false,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    ipAddress: '203.0.113.7',
    createdAt: '2026-10-20T07:45:00.000Z',
    updatedAt: '2026-10-21T07:45:00.000Z',
    expiresAt: '2026-10-27T07:45:00.000Z',
  },
  {
    token: 'staff',
    current: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    createdAt: '2026-10-24T13:10:00.000Z',
    updatedAt: '2026-10-24T13:10:00.000Z',
    expiresAt: '2026-10-24T14:10:00.000Z',
    staff: 'jan@protobase.example',
  },
  {
    token: 'mac',
    current: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    createdAt: '2026-10-25T09:00:00.000Z',
    updatedAt: '2026-10-25T09:00:00.000Z',
    expiresAt: '2026-11-01T09:00:00.000Z',
  },
]

const actions = { onSignOut: fn(async () => undefined), onSignOutOthers: fn(async () => undefined) }

/** This device comes first and has no Sign out; a staff session is named for the operator, never the staff member. */
export const Devices: StoryObj<DevicesSectionProps> = {
  tags: ['play'],
  args: { sessions, operator: 'Protobase', ...actions },
  render: (args) => <DevicesSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const rows = canvas.getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('bdi')?.textContent)).toEqual(['Chrome on macOS', 'Protobase staff', 'Safari on iPhone'])
    expect(within(rows[0]!).getByText('This device')).toBeVisible()
    expect(within(rows[0]!).queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(canvas.queryByText(/jan@protobase.example/)).toBeNull()

    await userEvent.click(within(rows[2]!).getByRole('button', { name: 'Sign out' }))
    const one = within(within(document.body).getByRole('dialog', { name: 'Sign out Safari on iPhone?' }))
    await userEvent.click(one.getByRole('button', { name: 'Sign out' }))
    expect(args.onSignOut).toHaveBeenCalledWith('iphone')

    await userEvent.click(canvas.getByRole('button', { name: 'Sign out of all other devices' }))
    const others = within(within(document.body).getByRole('dialog', { name: 'Sign out of all other devices?' }))
    await userEvent.click(others.getByRole('button', { name: 'Sign out' }))
    expect(args.onSignOutOthers).toHaveBeenCalledOnce()
  },
}

/** Signed in on this device alone: nothing to sign out here. */
export const ThisDeviceOnly: StoryObj<DevicesSectionProps> = {
  tags: ['play'],
  args: { sessions: sessions.slice(2), ...actions },
  render: (args) => <DevicesSection {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Chrome on macOS')).toBeVisible()
    expect(canvas.queryByRole('button', { name: /Sign out/ })).toBeNull()
  },
}

/** A staff session as the person cannot sign out the other devices: the server's refusal shows in the dialog. */
export const SignOutRefused: StoryObj<DevicesSectionProps> = {
  tags: ['play'],
  args: {
    sessions,
    ...actions,
    onSignOutOthers: fn(async () => {
      throw new AuthError("Staff cannot change a person's sign-in or the sign-in policy.", 403, 'STAFF_CANNOT_CHANGE_SIGN_IN')
    }),
  },
  render: (args) => <DevicesSection {...args} />,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText('Staff')).toBeVisible()
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Sign out of all other devices' }))
    const dialog = within(within(document.body).getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Sign out' }))
    expect(await dialog.findByText(/Staff cannot change/)).toBeVisible()
  },
}

const phoneApp: DeviceSession = { token: 'phone-app', current: false, userAgent: 'Okhttp/4.12.0', createdAt: '2026-10-26T08:00:00.000Z', updatedAt: '2026-10-26T08:00:00.000Z', expiresAt: '2026-11-02T08:00:00.000Z' }
const links: DeviceLink[] = [
  { id: 'link-1', provider: 'central', name: 'Central', device: "Sanne's phone", linkedAt: '2026-10-26T08:00:00.000Z', sessions: ['phone-app'] },
  { id: 'link-2', provider: 'central', name: 'Central', linkedAt: '2026-10-22T10:30:00.000Z', sessions: [] },
]

/** A device the platform links shows once, named by its provider and its own name, its sessions under it; signing it out is for good. */
export const LinkedDevices: StoryObj<DevicesSectionProps> = {
  tags: ['play'],
  args: { sessions: [...sessions.filter(({ staff }) => !staff), phoneApp], links, ...actions, onSignOutLink: fn(async () => undefined) },
  render: (args) => <DevicesSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const rows = canvas.getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('bdi')?.textContent)).toEqual(['Chrome on macOS', 'Safari on iPhone', "Sanne's phone (Central)", 'Central'])
    await userEvent.click(within(rows[2]!).getByRole('button', { name: 'Sign out' }))
    const dialog = within(within(document.body).getByRole('dialog', { name: "Sign out Sanne's phone (Central)?" }))
    expect(dialog.getByText(/cannot sign in to your account again/)).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Sign out' }))
    expect(args.onSignOutLink).toHaveBeenCalledWith('link-1')
  },
}
