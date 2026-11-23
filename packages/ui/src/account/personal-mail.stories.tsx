import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { AuthError, createStaticSession, type AuthSession, type MailConnectionListing, type MailSenders } from '@protobase/client'
import { AuthProvider } from '../auth/auth-provider'
import { PersonalMailBlock } from './blocks/personal-mail-block'

const meta = { title: 'Account blocks/Mailbox', decorators: [(Story) => <div className="flex max-w-3xl flex-col gap-4 bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const gmail = { id: 'gmail', name: 'Gmail', provider: 'google', scopes: ['https://www.googleapis.com/auth/gmail.send'], params: { access_type: 'offline', prompt: 'consent' } }

/**
 * A signed-in session on an app that sends mail from people's own Gmail, with the mailbox linked or not, and its From
 * addresses with what checking them with Gmail answers.
 */
const mailboxSession = (linked: string[], linkPersonalMail: AuthSession['account']['linkPersonalMail'] = fn(), providers: string[] = [], mail: { senders?: MailSenders; listed?: MailConnectionListing[] } = {}): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), personalMail: [gmail] }),
    account: { ...base.account, linkedPersonalMail: async () => linked, linkedProviders: async () => providers, linkPersonalMail, mailSenders: async () => mail.senders ?? { senders: [] }, refreshMailSenders: async () => mail.listed ?? [] },
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

/** Signed in with Google, which did not allow sending mail: the block says that sign-in is no mailbox, and still offers to connect Gmail. */
export const GoogleSignInOnly: StoryObj = {
  tags: ['play'],
  render: () => (
    <AuthProvider session={mailboxSession([], fn(), ['google'])}>
      <PersonalMailBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    const mailbox = within(await within(canvasElement).findByRole('region', { name: 'Mailbox' }))
    expect(await mailbox.findByText('You sign in with Google, but that sign-in does not allow sending mail: connect Gmail to send from it.')).toBeVisible()
    expect(mailbox.queryByText('Connected')).toBeNull()
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

// Never answers, so the story stays on the page instead of leaving for Google.
const linkPending = fn(() => new Promise<string>(() => {}))

const listingGmail = { id: 'c1', provider: 'gmail', address: 'ana@gmail.example', canList: true, missingScopes: [] }
const expired = { senders: { address: 'ana@gmail.example', senders: [], connections: [listingGmail] }, listed: [{ connection: 'c1', provider: 'gmail', status: 'error' as const, code: 'link_expired' as const }] }
const missingScope = { senders: { address: 'ana@gmail.example', senders: [], connections: [{ ...listingGmail, missingScopes: ['https://www.googleapis.com/auth/gmail.settings.basic'] }] } }

// Every button of the block that connects Gmail, whatever it is for.
const connectButtons = (mailbox: ReturnType<typeof within>) => mailbox.getAllByRole('button', { name: /^(Connect Gmail|Allow address checks)/ })

/** Gmail no longer accepts the link: the Mailbox row says Not connected, its card connects again, and the From addresses add nothing. */
export const LinkExpired: StoryObj = {
  tags: ['play', 'touch'],
  render: () => (
    <AuthProvider session={mailboxSession(['gmail'], linkPending, [], expired)}>
      <PersonalMailBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    const mailbox = within(await within(canvasElement).findByRole('region', { name: 'Mailbox' }))
    expect(await mailbox.findByText('Not connected')).toBeVisible()
    expect(mailbox.queryByText('Connected')).toBeNull()
    expect(mailbox.getAllByRole('heading', { name: 'Connect Gmail again' })).toHaveLength(1)
    expect(connectButtons(mailbox)).toHaveLength(1)
    // Consent comes back to the From addresses.
    await userEvent.click(mailbox.getByRole('button', { name: 'Connect Gmail again' }))
    expect(linkPending).toHaveBeenCalledWith(expect.objectContaining({ id: 'gmail' }), expect.stringMatching(/#from-addresses$/))
  },
}

/** The same on a laptop screen. */
export const LinkExpiredLaptop: StoryObj = { ...LinkExpired, tags: ['play', 'laptop'] }

/** Gmail linked without the scope that checks addresses: its card connects with every scope, so the row offers no button of its own. */
export const MissingScope: StoryObj = {
  tags: ['play', 'touch'],
  render: () => (
    <AuthProvider session={mailboxSession(['gmail'], linkPending, [], missingScope)}>
      <PersonalMailBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    const mailbox = within(await within(canvasElement).findByRole('region', { name: 'Mailbox' }))
    expect(await mailbox.findByRole('heading', { name: 'Check your addresses with Gmail' })).toBeVisible()
    expect(mailbox.getByText('Connected')).toBeVisible()
    expect(connectButtons(mailbox)).toHaveLength(1)
    expect(mailbox.getByRole('button', { name: 'Allow address checks' })).toBeEnabled()
  },
}

/** The same on a laptop screen. */
export const MissingScopeLaptop: StoryObj = { ...MissingScope, tags: ['play', 'laptop'] }

/** Back from Gmail's consent at the From addresses: focus is on their heading. */
export const BackFromConsent: StoryObj = {
  tags: ['play'],
  beforeEach: () => {
    const before = window.location.href
    window.history.replaceState(window.history.state, '', '#from-addresses')
    return () => window.history.replaceState(window.history.state, '', before)
  },
  render: () => (
    <AuthProvider session={mailboxSession(['gmail'])}>
      <PersonalMailBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    const heading = await within(canvasElement).findByRole('heading', { name: 'From addresses' })
    await waitFor(() => expect(heading).toHaveFocus())
  },
}
