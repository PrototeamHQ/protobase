import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { AuthError, createStaticSession, type AuthSession, type WorkflowConnection } from '@protobase/client'
import { AuthProvider } from '../auth/auth-provider'
import { ConnectionsBlock } from './blocks/connections-block'

const meta = { title: 'Account blocks/Connections', decorators: [(Story) => <div className="flex max-w-3xl flex-col gap-4 bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const google: WorkflowConnection = {
  key: 'gmail:google',
  label: 'Google account',
  provider: 'google',
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  link_params: { access_type: 'offline', prompt: 'consent' },
  accounts: [{ id: 'acc-1', scopes: ['https://www.googleapis.com/auth/gmail.readonly'], created_at: '2026-11-02T09:00:00Z', needs_sign_in: true }],
}

/** A signed-in session on an app whose workflow plugins declare a Google connection, which Ana connected once. */
const connectionsSession = (connections: WorkflowConnection[], disconnectAccount: AuthSession['account']['disconnectAccount'] = fn(async () => {})): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' })
  // Refuses to start, so the story stays on the page instead of leaving for Google.
  const connectAccount = fn(async () => {
    throw new AuthError('Google is not set up.', 400, 'PROVIDER_NOT_FOUND')
  })
  return { ...base, account: { ...base.account, workflowConnections: async () => connections, connectAccount, disconnectAccount } }
}

const disconnect = fn(async () => {})

/** A connected account a trigger waits on: the block says to connect it again, and disconnecting warns that Google ends every grant. */
export const ConnectedChecks: StoryObj = {
  name: 'Connects and disconnects an account (checks)',
  tags: ['play'],
  render: () => (
    <AuthProvider session={connectionsSession([google], disconnect)}>
      <ConnectionsBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    const section = within(await within(canvasElement).findByRole('region', { name: 'Connections' }))
    expect(section.getByText('Connect it again')).toBeVisible()
    expect(section.getByRole('button', { name: 'Connect Google account again' })).toBeEnabled()
    await userEvent.click(section.getByRole('button', { name: 'Disconnect' }))
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))
    expect(dialog.getByText(/Google ends everything you allowed this app at once/)).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith('acc-1'))
  },
}
/** No connection declared: the block leaves itself out. */
export const NoneDeclared: StoryObj = {
  tags: ['play'],
  render: () => (
    <AuthProvider session={connectionsSession([])}>
      <ConnectionsBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.textContent).toBe(''))
  },
}
