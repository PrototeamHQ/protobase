import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, spyOn, userEvent, within } from 'storybook/test'
import { AuthError } from '@protobase/client'
import { PersonalAccessTokensSection, type PersonalAccessTokensSectionProps } from './personal-access-tokens-section'

const meta = { title: 'Account/Access tokens', decorators: [(Story) => <div className="max-w-3xl bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const tokens: PersonalAccessTokensSectionProps['tokens'] = [
  { id: 't1', name: 'Weekly invoices', role: 'Accountant', organization: 'Acme', createdAt: '2026-10-18T09:30:00.000Z', expiresAt: '2027-01-16T09:30:00.000Z', lastUsedAt: '2026-11-02T06:00:00.000Z' },
  { id: 't2', name: 'Stock sync', role: 'Sales', createdAt: '2026-09-21T11:00:00.000Z' },
]

const created = { token: 'invoices_4kPqZ9vTzAWm2Rbc8Hn4kPqZ9vTzAWm2Rbc8Hn4k1a2B3c', personalAccessToken: { id: 't3', name: 'Reports', role: 'Sales', createdAt: '2026-11-09T10:00:00.000Z' } }

/** The tokens with what each acts as, a new one shown once to copy, and revoking one after asking. */
export const AccessTokens: StoryObj<PersonalAccessTokensSectionProps> = {
  tags: ['play'],
  args: { tokens, onCreate: fn(async () => created), onRevoke: fn(async () => undefined) },
  render: (args) => <PersonalAccessTokensSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    expect(canvas.getByText(/Last used .* · As Accountant in Acme/)).toBeVisible()
    expect(canvas.getByText(/Never expires · Not used yet · As Sales/)).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'New token' }))
    await userEvent.type(page.getByLabelText('Name'), 'Reports')
    await userEvent.selectOptions(page.getByLabelText('Expires'), 'In 30 days')
    await userEvent.click(page.getByRole('button', { name: 'Create token' }))
    expect(args.onCreate).toHaveBeenCalledWith({ name: 'Reports', expiresInDays: 30 })
    const shown = within(await page.findByRole('dialog', { name: 'Reports is ready' }))
    expect(shown.getByText(created.token)).toBeVisible()
    // The clipboard as a browser that allows it, then as one that refuses it, where the token stays to copy by hand.
    const writeText = spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await userEvent.click(shown.getByRole('button', { name: 'Copy the token' }))
    expect(writeText).toHaveBeenCalledWith(created.token)
    expect(await shown.findByRole('button', { name: 'Copied' })).toBeVisible()
    writeText.mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'))
    await userEvent.click(shown.getByRole('button', { name: 'Copied' }))
    expect(await shown.findByRole('alert')).toHaveTextContent('select the text and copy it yourself')
    writeText.mockRestore()
    await userEvent.click(shown.getByRole('button', { name: 'Done' }))

    await userEvent.click(canvas.getAllByRole('button', { name: 'Revoke' })[1]!)
    const dialog = within(page.getByRole('dialog', { name: 'Revoke Stock sync?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Revoke' }))
    expect(args.onRevoke).toHaveBeenCalledWith('t2')
  },
}

/** A new token from an older session: the dialog asks to confirm it's them in place. */
export const AccessTokenConfirmInPlace: StoryObj<PersonalAccessTokensSectionProps> = {
  tags: ['play'],
  args: { tokens: [], onCreate: fn(async () => Promise.reject(new AuthError("Confirm it's you first", 403, 'STRONG_SIGN_IN_REQUIRED'))), onRevoke: fn(async () => undefined) },
  render: (args) => (
    <QueryClientProvider client={new QueryClient()}>
      <PersonalAccessTokensSection {...args} />
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    expect(canvas.getByText('You have no access tokens.')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'New token' }))
    await userEvent.type(page.getByLabelText('Name'), 'Reports')
    await userEvent.click(page.getByRole('button', { name: 'Create token' }))
    expect(await page.findByRole('region', { name: "Confirm it's you" })).toBeVisible()
  },
}

/** A request whose answer never comes, such as when offline: the dialog says the result is unknown and stays open. */
export const AccessTokenServerUnreachable: StoryObj<PersonalAccessTokensSectionProps> = {
  tags: ['play'],
  args: { tokens, onCreate: fn(async () => created), onRevoke: fn(async () => Promise.reject(new TypeError('Failed to fetch'))) },
  render: (args) => <PersonalAccessTokensSection {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Revoke' })[0]!)
    const dialog = within(within(document.body).getByRole('dialog', { name: 'Revoke Weekly invoices?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Revoke' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('check the list before you try again')
    expect(dialog.getByRole('button', { name: 'Revoke' })).toBeEnabled()
  },
}
