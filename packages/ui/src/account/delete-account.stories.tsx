import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AuthError, createStaticSession, type AuthSession } from '@protobase/client'
import { AuthProvider, useAuth } from '../auth/auth-provider'
import { DeleteAccountBlock } from './blocks/delete-account-block'

const meta = { title: 'Account blocks/Delete account', decorators: [(Story) => <div className="flex max-w-3xl flex-col gap-4 bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

/** A signed-in session with a password, whose account is deleted once the password `correct horse` comes with it. */
const deletableSession = (deleteAccount: (password?: string) => Promise<void>): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' })
  return {
    ...base,
    deleteAccount: async (password) => {
      if (password !== 'correct horse') throw new AuthError('Invalid password', 400, 'INVALID_PASSWORD')
      await deleteAccount(password)
    },
    account: {
      ...base.account,
      signInMethods: async () => ({ ...(await base.account.signInMethods()), account: { password: true, passkeys: 0, twoFactor: false, authenticatorApp: false } }),
    },
  }
}

const SignedIn = () => <p>{useAuth().state.kind === 'signed-in' ? 'Signed in' : 'Signed out'}</p>

/** The person deletes their account after confirming with their password: a wrong one is refused, the right one signs them out. */
export const DeleteAccount: StoryObj<{ deleteAccount: (password?: string) => Promise<void> }> = {
  tags: ['play'],
  args: { deleteAccount: fn(async () => undefined) },
  render: (args) => (
    <AuthProvider session={deletableSession(args.deleteAccount)}>
      <SignedIn />
      <DeleteAccountBlock />
    </AuthProvider>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const section = within(await canvas.findByRole('region', { name: 'Delete account' }))
    expect(await canvas.findByText('Signed in')).toBeVisible()
    await userEvent.click(section.getByRole('button', { name: 'Delete account' }))
    const dialog = within(await within(document.body).findByRole('dialog', { name: 'Delete your account?' }))
    const confirm = dialog.getByRole('button', { name: 'Delete my account' })
    expect(confirm).toBeDisabled()

    await userEvent.type(dialog.getByLabelText('Enter your password to confirm.'), 'wrong')
    await userEvent.click(confirm)
    expect(await dialog.findByText('The password is not right.')).toBeVisible()
    expect(args.deleteAccount).not.toHaveBeenCalled()

    await userEvent.clear(dialog.getByLabelText('Enter your password to confirm.'))
    await userEvent.type(dialog.getByLabelText('Enter your password to confirm.'), 'correct horse')
    await userEvent.click(confirm)
    expect(args.deleteAccount).toHaveBeenCalledWith('correct horse')
    expect(await canvas.findByText('Signed out')).toBeVisible()
  },
}
