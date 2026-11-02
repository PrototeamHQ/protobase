import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AuthError } from '@protobase/client'
import { PasswordSection, type PasswordSectionProps } from './password-section'

const meta = { title: 'Account/Password', decorators: [(Story) => <div className="max-w-3xl bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const changes = { onChange: fn(async () => undefined), onSet: fn(async () => undefined) }

/** With a password: the current one and the new one twice, saying the other devices are signed out. */
export const ChangePassword: StoryObj<PasswordSectionProps> = {
  tags: ['play'],
  args: { rule: 'allowed', hasPassword: true, staff: false, ...changes },
  render: (args) => <PasswordSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change password' }))
    const dialog = within(within(document.body).getByRole('dialog', { name: 'Change password' }))
    await userEvent.type(dialog.getByLabelText('Current password'), 'old long password')
    await userEvent.type(dialog.getByLabelText('New password'), 'a new long password')
    await userEvent.type(dialog.getByLabelText('Repeat new password'), 'a new long passwort')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('The passwords are not the same.')
    expect(args.onChange).not.toHaveBeenCalled()

    await userEvent.clear(dialog.getByLabelText('Repeat new password'))
    await userEvent.type(dialog.getByLabelText('Repeat new password'), 'a new long password')
    expect(dialog.getByText('Saving signs out your other devices.')).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(args.onChange).toHaveBeenCalledWith('old long password', 'a new long password')
    expect(await canvas.findByRole('status')).toHaveTextContent('Your password is saved.')
  },
}

/** A wrong current password keeps the dialog open, saying so. */
export const WrongCurrentPassword: StoryObj<PasswordSectionProps> = {
  tags: ['play'],
  args: { ...ChangePassword.args, onChange: fn(async () => Promise.reject(new AuthError('Invalid password', 400, 'INVALID_PASSWORD'))) },
  render: (args) => <PasswordSection {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Change password' }))
    const dialog = within(within(document.body).getByRole('dialog', { name: 'Change password' }))
    await userEvent.type(dialog.getByLabelText('Current password'), 'not my password')
    await userEvent.type(dialog.getByLabelText('New password'), 'a new long password')
    await userEvent.type(dialog.getByLabelText('Repeat new password'), 'a new long password')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('The password is not right.')
  },
}

/** Without a password: a first one, with no current one to give and no devices to sign out. */
export const SetPassword: StoryObj<PasswordSectionProps> = {
  tags: ['play'],
  args: { rule: 'allowed', hasPassword: false, staff: false, ...changes },
  render: (args) => <PasswordSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Set a password' }))
    const dialog = within(within(document.body).getByRole('dialog', { name: 'Set a password' }))
    expect(dialog.queryByLabelText('Current password')).toBeNull()
    expect(dialog.queryByText('Saving signs out your other devices.')).toBeNull()
    await userEvent.type(dialog.getByLabelText('New password'), 'too short')
    await userEvent.type(dialog.getByLabelText('Repeat new password'), 'too short')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('Use at least 12 characters.')

    await userEvent.type(dialog.getByLabelText('New password'), ' but now long')
    await userEvent.type(dialog.getByLabelText('Repeat new password'), ' but now long')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(args.onSet).toHaveBeenCalledWith('too short but now long')
  },
}

export const PasswordsTurnedOff: StoryObj<PasswordSectionProps> = {
  tags: ['play'],
  args: { rule: 'forbidden', hasPassword: false, staff: false, ...changes },
  render: (args) => <PasswordSection {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText(/turned passwords off/)).toBeVisible()
    expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** Staff signed in as the person may not change their sign-in, so there is nothing to press. */
export const StaffSession: StoryObj<PasswordSectionProps> = {
  tags: ['play'],
  args: { rule: 'allowed', hasPassword: true, staff: true, ...changes },
  render: (args) => <PasswordSection {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Staff signed in as someone cannot change their password.')).toBeVisible()
    expect(canvas.queryByRole('button')).toBeNull()
  },
}
