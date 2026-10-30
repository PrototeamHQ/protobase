import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { createStaticSession, type AuthSession } from '@protobase/client'
import { AuthProvider } from '../auth/auth-provider'
import { PersonalMailBlock } from './blocks/personal-mail-block'

const meta = { title: 'Account blocks/Mailbox', decorators: [(Story) => <div className="flex max-w-3xl flex-col gap-4 bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const gmail = { id: 'gmail', name: 'Gmail', provider: 'google', scopes: ['https://www.googleapis.com/auth/gmail.send'], params: { access_type: 'offline', prompt: 'consent' } }

/** A signed-in session on an app that sends mail from people's own Gmail, with the mailbox linked or not. */
const mailboxSession = (linked: string[]): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), personalMail: [gmail] }),
    account: { ...base.account, linkedPersonalMail: async () => linked },
  }
}

/** Nothing linked yet: the block offers to connect Gmail. */
export const NotLinked: StoryObj = {
  tags: ['play'],
  render: () => (
    <AuthProvider session={mailboxSession([])}>
      <PersonalMailBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    const mailbox = within(await within(canvasElement).findByRole('region', { name: 'Mailbox' }))
    expect(mailbox.getByText('Gmail')).toBeVisible()
    expect(mailbox.getByRole('button', { name: 'Connect Gmail' })).toBeEnabled()
  },
}

/** Gmail linked with leave to send: the block says so. */
export const Linked: StoryObj = {
  tags: ['play'],
  render: () => (
    <AuthProvider session={mailboxSession(['gmail'])}>
      <PersonalMailBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    const mailbox = within(await within(canvasElement).findByRole('region', { name: 'Mailbox' }))
    expect(await mailbox.findByText('Connected')).toBeVisible()
    expect(mailbox.queryByRole('button', { name: 'Connect Gmail' })).toBeNull()
  },
}
