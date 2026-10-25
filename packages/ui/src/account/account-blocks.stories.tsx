import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { createStaticSession, type AuthSession } from '@protobase/client'
import { AuthProvider } from '../auth/auth-provider'
import { ConnectedAccountsBlock } from './blocks/connected-accounts-block'
import { ConnectedAppsBlock } from './blocks/connected-apps-block'
import { PasskeysBlock } from './blocks/passkeys-block'
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
 * Each block reads its own data: the profile changes the name, passkeys and two-factor follow the policy, and connected
 * accounts and apps stay hidden in an app without OAuth providers or MCP.
 */
export const AccountBlocks: StoryObj<{ updateName: (name: string) => Promise<void> }> = {
  tags: ['play'],
  args: { updateName: fn(async () => undefined) },
  render: (args) => (
    <AuthProvider session={sessionWith(args.updateName)}>
      <ProfileBlock />
      <PasskeysBlock />
      <TwoFactorBlock />
      <ConnectedAccountsBlock />
      <ConnectedAppsBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const profile = within(await canvas.findByRole('region', { name: 'Profile' }))
    expect(profile.getByText('Ana de Vries')).toBeVisible()
    expect(profile.getByText('ana@shop.example')).toBeVisible()
    expect(await canvas.findByRole('region', { name: 'Passkeys' })).toBeVisible()
    expect(await canvas.findByRole('region', { name: 'Two-factor authentication' })).toBeVisible()
    expect(canvas.queryByRole('region', { name: 'Connected accounts' })).toBeNull()
    expect(canvas.queryByRole('region', { name: 'Connected apps' })).toBeNull()

    await userEvent.click(profile.getByRole('button', { name: 'Change name' }))
    const dialog = within(document.body)
    await userEvent.clear(dialog.getByLabelText('Name'))
    await userEvent.type(dialog.getByLabelText('Name'), 'Ana Jansen')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(args.updateName).toHaveBeenCalledWith('Ana Jansen')
    expect(await profile.findByText('Ana Jansen')).toBeVisible()
  },
}
