import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { SignInPolicyState } from '@protobase/client'
import { BackupCodes } from './backup-codes'
import { PasskeysSection, type PasskeysSectionProps } from './passkeys-section'
import { SignInPolicyForm, type SignInPolicyFormProps } from './sign-in-policy-form'
import { TwoFactorSection, type TwoFactorSectionProps } from './two-factor-section'

const meta = { title: 'Account', decorators: [(Story) => <div className="max-w-3xl bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const passkeys = [
  { id: 'p1', name: 'MacBook Pro', createdAt: '2026-09-14T08:12:00.000Z', backedUp: true },
  { id: 'p2', createdAt: '2026-10-02T15:40:00.000Z', backedUp: false },
]
const changes = { onAdd: fn(async () => undefined), onRename: fn(async () => undefined), onRemove: fn(async () => undefined) }

export const Passkeys: StoryObj<PasskeysSectionProps> = {
  tags: ['play'],
  args: { rule: 'allowed', passkeys, ...changes },
  render: (args) => <PasskeysSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('MacBook Pro')).toBeVisible()
    expect(canvas.getByText(/Synced across your devices/)).toBeVisible()
    await userEvent.click(canvas.getAllByRole('button', { name: 'Rename' })[1]!)
    await userEvent.type(within(document.body).getByLabelText('Name'), 'YubiKey')
    await userEvent.click(within(document.body).getByRole('button', { name: 'Save' }))
    expect(args.onRename).toHaveBeenCalledWith('p2', 'YubiKey')
    await userEvent.click(canvas.getByRole('button', { name: 'Add a passkey' }))
    expect(args.onAdd).toHaveBeenCalledOnce()
  },
}

export const PasskeysRequired: StoryObj<PasskeysSectionProps> = {
  tags: ['play'],
  args: { rule: 'required', passkeys: passkeys.slice(0, 1), ...changes },
  render: (args) => <PasskeysSection {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Required')).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Remove' })).toBeDisabled()
  },
}

export const PasskeysTurnedOff: StoryObj<PasskeysSectionProps> = {
  tags: ['play'],
  args: { rule: 'forbidden', passkeys: [], ...changes },
  render: (args) => <PasskeysSection {...args} />,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: 'Add a passkey' })).toBeNull()
  },
}

const twoFactor = {
  rule: 'allowed',
  enabled: false,
  authenticatorApp: false,
  mail: true,
  needsPassword: true,
  onStartApp: fn(async () => ({ totpURI: 'otpauth://totp/Protobase:sanne%40veldhuis-supply.example?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Protobase', backupCodes: ['k3PqZ-9vTzA', 'Wm2Rb-c8Hn4'] })),
  onConfirmApp: fn(async () => undefined),
  onEmailedCodes: fn(async () => undefined),
  onTurnOff: fn(async () => undefined),
  onNewBackupCodes: fn(async () => ['Hq7Ls-2xPdN', 'Rt5Vy-m3KcB']),
  onChanged: fn(),
} satisfies TwoFactorSectionProps

export const TwoFactorOff: StoryObj<TwoFactorSectionProps> = {
  tags: ['play'],
  args: twoFactor,
  render: (args) => <TwoFactorSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Turn on' }))
    await userEvent.type(canvas.getByLabelText('Your password'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }))
    expect(args.onStartApp).toHaveBeenCalledWith('correct horse battery')
    await userEvent.type(await canvas.findByLabelText('Code from the app'), '123456')
    await userEvent.click(canvas.getByRole('button', { name: 'Turn on' }))
    expect(args.onConfirmApp).toHaveBeenCalledWith('123456')
    expect(await canvas.findByText('k3PqZ-9vTzA')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'I saved my backup codes' }))
    expect(args.onChanged).toHaveBeenCalledOnce()
  },
}

export const TwoFactorOnWithApp: StoryObj<TwoFactorSectionProps> = {
  tags: ['play'],
  args: { ...twoFactor, enabled: true, authenticatorApp: true },
  render: (args) => <TwoFactorSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'New backup codes' }))
    const dialog = within(document.body)
    await userEvent.type(dialog.getByLabelText('Your password'), 'correct horse battery')
    await userEvent.click(dialog.getByRole('button', { name: 'Make new codes' }))
    expect(args.onNewBackupCodes).toHaveBeenCalledWith('correct horse battery')
    expect(await dialog.findByText('Hq7Ls-2xPdN')).toBeVisible()
  },
}

export const TwoFactorRequiredByEmail: StoryObj<TwoFactorSectionProps> = {
  tags: ['play'],
  args: { ...twoFactor, rule: 'required', enabled: true },
  render: (args) => <TwoFactorSection {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: 'Turn off' })).toBeDisabled()
    expect(canvas.getByRole('button', { name: 'Add an authenticator app' })).toBeEnabled()
  },
}

export const NewBackupCodes: StoryObj = {
  render: () => <BackupCodes codes={['k3PqZ-9vTzA', 'Wm2Rb-c8Hn4', 'Hq7Ls-2xPdN', 'Rt5Vy-m3KcB', 'Ba9Ne-4sXqL', 'Pd6Gw-t2MvC', 'Lf3Kc-8yRbZ', 'Zx4Tn-q7WpH', 'Cv8Ja-5mLsD', 'Ny2Qe-r9BhF']} />,
}

const policyState: SignInPolicyState = {
  policy: { password: 'allowed', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'allowed' },
  effective: { password: 'allowed', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'allowed' },
  mail: true,
}

export const SignInPolicy: StoryObj<SignInPolicyFormProps> = {
  tags: ['play'],
  args: { state: policyState, onSave: fn() },
  render: (args) => <SignInPolicyForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.click(within(canvas.getByRole('radiogroup', { name: 'Two-factor authentication' })).getByRole('radio', { name: 'Required' }))
    await userEvent.click(within(canvas.getByRole('radiogroup', { name: 'Password' })).getByRole('radio', { name: 'Off' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    expect(args.onSave).toHaveBeenCalledWith({ password: 'forbidden', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'required' })
  },
}

export const SignInPolicyRefused: StoryObj<SignInPolicyFormProps> = {
  args: {
    state: { ...policyState, policy: { ...policyState.policy, passkey: 'required' }, effective: { ...policyState.effective, passkey: 'required' }, savedAt: '2026-10-09T14:05:00.000Z', savedBy: 'sanne@veldhuis-supply.example' },
    onSave: fn(),
    error: 'Keep password or emailed-code sign-in on: people without a passkey need one of them to sign in.',
  },
  render: (args) => <SignInPolicyForm {...args} />,
}

export const SignInPolicyWithoutMail: StoryObj<SignInPolicyFormProps> = {
  tags: ['play'],
  args: { state: { ...policyState, effective: { ...policyState.effective, emailCode: 'forbidden' }, mail: false }, onSave: fn() },
  render: (args) => <SignInPolicyForm {...args} />,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText(/Needs mail settings/)).toBeVisible()
  },
}
