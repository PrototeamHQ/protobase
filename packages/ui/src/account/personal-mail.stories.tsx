import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AuthError, createStaticSession, type AuthSession } from '@protobase/client'
import { AuthProvider } from '../auth/auth-provider'
import { PersonalMailBlock } from './blocks/personal-mail-block'

const meta = { title: 'Account blocks/Mailbox', decorators: [(Story) => <div className="flex max-w-3xl flex-col gap-4 bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const gmail = { id: 'gmail', name: 'Gmail', provider: 'google', scopes: ['https://www.googleapis.com/auth/gmail.send'], params: { access_type: 'offline', prompt: 'consent' } }

/** A signed-in session on an app that sends mail from people's own Gmail, with the mailbox linked or not. */
const mailboxSession = (linked: string[], linkPersonalMail: AuthSession['account']['linkPersonalMail'] = fn()): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), personalMail: [gmail] }),
    account: { ...base.account, linkedPersonalMail: async () => linked, linkPersonalMail },
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

// Refuses to start, so the story stays on the page instead of leaving for Google.
const linkRefused = fn(async () => {
  throw new AuthError('Google is not set up.', 400, 'PROVIDER_NOT_FOUND')
})

/** Gmail linked with leave to send: the block says so, and offers to connect it again, as a link that stopped working needs. */
export const Linked: StoryObj = {
  tags: ['play'],
  render: () => (
    <AuthProvider session={mailboxSession(['gmail'], linkRefused)}>
      <PersonalMailBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    const mailbox = within(await within(canvasElement).findByRole('region', { name: 'Mailbox' }))
    expect(await mailbox.findByText('Connected')).toBeVisible()
    expect(mailbox.queryByRole('button', { name: 'Connect Gmail' })).toBeNull()
    await userEvent.click(mailbox.getByRole('button', { name: 'Connect Gmail again' }))
    expect(linkRefused).toHaveBeenCalledWith(expect.objectContaining({ id: 'gmail' }), expect.any(String))
  },
}
