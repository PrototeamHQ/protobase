import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AuthError, createStaticSession, type AuthSession } from '@protobase/client'
import { AuthProvider } from '../auth/auth-provider'
import { MetaContext } from '../data/meta-context'
import type { MetaData } from '../data/meta-data'
import { ConnectedAccountsBlock } from './blocks/connected-accounts-block'
import { ConnectedAppsBlock } from './blocks/connected-apps-block'
import { DevicesBlock } from './blocks/devices-block'
import { PasskeysBlock } from './blocks/passkeys-block'
import { PasswordBlock } from './blocks/password-block'
import { ProfileBlock } from './blocks/profile-block'
import { TwoFactorBlock } from './blocks/two-factor-block'

const meta = { title: 'Account blocks', decorators: [(Story) => <div className="flex max-w-3xl flex-col gap-4 bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

/** A signed-in session whose name changes stick, so the Profile block reads the new one back. */
const sessionWith = (updateName: (name: string) => Promise<void>): AuthSession => {
  let user = { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' }
  const base = createStaticSession('story-token', user)
  return {
    ...base,
    session: async () => user,
    account: {
      ...base.account,
      updateName: async (name) => {
        await updateName(name)
        user = { ...user, name }
      },
    },
  }
}

/**
 * Each block reads its own data: the profile changes the name, an account without a password can set one, passkeys and two-factor follow the policy, devices lists
 * the static session's none, and connected accounts and apps stay hidden in an app without OAuth providers or MCP.
 */
export const AccountBlocks: StoryObj<{ updateName: (name: string) => Promise<void> }> = {
  tags: ['play'],
  args: { updateName: fn(async () => undefined) },
  render: (args) => (
    <AuthProvider session={sessionWith(args.updateName)}>
      <ProfileBlock />
      <PasswordBlock />
      <PasskeysBlock />
      <TwoFactorBlock />
      <ConnectedAccountsBlock />
      <DevicesBlock />
      <ConnectedAppsBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const profile = within(await canvas.findByRole('region', { name: 'Profile' }))
    expect(profile.getByText('Ana de Vries')).toBeVisible()
    expect(profile.getByText('ana@shop.example')).toBeVisible()
    expect(within(await canvas.findByRole('region', { name: 'Password' })).getByRole('button', { name: 'Set a password' })).toBeVisible()
    expect(profile.queryByRole('button', { name: 'Change email' })).toBeNull()
    expect(await canvas.findByRole('region', { name: 'Passkeys' })).toBeVisible()
    expect(await canvas.findByRole('region', { name: 'Two-factor authentication' })).toBeVisible()
    expect(canvas.queryByRole('region', { name: 'Connected accounts' })).toBeNull()
    expect(await canvas.findByRole('region', { name: 'Devices' })).toBeVisible()
    expect(canvas.queryByRole('region', { name: 'Connected apps' })).toBeNull()
    expect(canvas.queryByRole('region', { name: 'MCP address' })).toBeNull()

    await userEvent.click(profile.getByRole('button', { name: 'Change name' }))
    const dialog = within(document.body)
    await userEvent.clear(dialog.getByLabelText('Name'))
    await userEvent.type(dialog.getByLabelText('Name'), 'Ana Jansen')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(args.updateName).toHaveBeenCalledWith('Ana Jansen')
    expect(await profile.findByText('Ana Jansen')).toBeVisible()
  },
}

/** A signed-in session on a server with mail, whose address moves once the code `246810` mailed to the new one comes back. */
const mailingSession = (requestEmailChange: (newEmail: string) => Promise<void>): AuthSession => {
  let user = { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' }
  const base = createStaticSession('story-token', user)
  return {
    ...base,
    status: async () => ({ ...(await base.status()), changeEmail: true }),
    session: async () => user,
    account: {
      ...base.account,
      requestEmailChange,
      changeEmail: async (newEmail, code) => {
        if (code !== '246810') throw new AuthError('Invalid OTP', 400, 'INVALID_OTP')
        user = { ...user, email: newEmail }
      },
    },
  }
}

/** With mail, the profile changes the address: a code goes to the new one, and a wrong code is refused before the right one moves it. */
export const ChangeEmail: StoryObj<{ requestEmailChange: (newEmail: string) => Promise<void> }> = {
  tags: ['play'],
  args: { requestEmailChange: fn(async () => undefined) },
  render: (args) => (
    <AuthProvider session={mailingSession(args.requestEmailChange)}>
      <ProfileBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement, args }) => {
    const profile = within(await within(canvasElement).findByRole('region', { name: 'Profile' }))
    await userEvent.click(await profile.findByRole('button', { name: 'Change email' }))
    const dialog = within(document.body)
    await userEvent.type(dialog.getByLabelText('New email'), 'ana@new.example')
    await userEvent.click(dialog.getByRole('button', { name: 'Send code' }))
    expect(args.requestEmailChange).toHaveBeenCalledWith('ana@new.example')
    expect(await dialog.findByText(/we emailed to ana@new\.example/)).toBeVisible()

    await userEvent.type(dialog.getByLabelText('Code'), '111111')
    expect(await dialog.findByRole('alert')).toBeVisible()
    await userEvent.clear(dialog.getByLabelText('Code'))
    await userEvent.type(dialog.getByLabelText('Code'), '246810')
    expect(await profile.findByText('ana@new.example')).toBeVisible()
    expect(dialog.queryByRole('dialog')).toBeNull()
  },
}

const shop: MetaData = { etag: '"shop"', appName: 'Shop & Co', resources: {}, views: {}, pages: {}, permissions: {} }

/** A signed-in session on an app whose MCP endpoint is at the custom path `/tools/mcp`. */
const mcpSession = (): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' })
  return { ...base, status: async () => ({ ...(await base.status()), mcp: { url: 'https://shop.example/tools/mcp' } }) }
}

/** With MCP on, the Connected apps block shows the endpoint's address to copy and a link that adds it to Claude, above the apps. */
export const McpAddress: StoryObj = {
  tags: ['play'],
  render: () => (
    <MetaContext.Provider value={shop}>
      <AuthProvider session={mcpSession()}>
        <ConnectedAppsBlock />
      </AuthProvider>
    </MetaContext.Provider>
  ),
  play: async ({ canvasElement }) => {
    const section = within(await within(canvasElement).findByRole('region', { name: 'MCP address' }))
    expect(section.getByText('https://shop.example/tools/mcp')).toBeVisible()
    expect(section.getByRole('button', { name: 'Copy the MCP address' })).toBeVisible()
    const add = new URL(section.getByRole('link', { name: 'Add to Claude' }).getAttribute('href')!)
    expect(add.searchParams.get('connectorUrl')).toBe('https://shop.example/tools/mcp')
    expect(add.searchParams.get('connectorName')).toBe('Shop & Co')
    expect(await within(canvasElement).findByRole('region', { name: 'Connected apps' })).toBeVisible()
  },
}
