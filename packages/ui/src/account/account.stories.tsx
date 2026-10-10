import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { SignInPolicyState, StaffSignIn } from '@protobase/client'
import { BackupCodes } from './backup-codes'
import { PasskeysSection, type PasskeysSectionProps } from './passkeys-section'
import { SignInProvidersSection, type SignInProvidersSectionProps } from './sign-in-providers-section'
import { SignInPolicyForm, type SignInPolicyFormProps } from './sign-in-policy-form'
import { StaffSignInLog, type StaffSignInLogProps } from './staff-sign-in-log'
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
  policy: { password: 'allowed', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'allowed', staffAccess: 'allowed', platformSignIn: 'allowed' },
  effective: { password: 'allowed', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'allowed', staffAccess: 'allowed', platformSignIn: 'allowed' },
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
    expect(args.onSave).toHaveBeenCalledWith({ password: 'forbidden', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'required', staffAccess: 'allowed', platformSignIn: 'allowed' })
    expect(canvas.queryByRole('radiogroup', { name: 'Staff sign-in as a person' })).toBeNull()
    expect(canvas.queryByText(/through the platform/)).toBeNull()
  },
}

/** When the platform adds a sign-in provider, admins can turn it off; it is off anyway while a second step is required. */
export const SignInPolicyWithPlatformSignIn: StoryObj<SignInPolicyFormProps> = {
  tags: ['play'],
  args: { state: { ...policyState, platformSignIn: 'GitHub' }, onSave: fn() },
  render: (args) => <SignInPolicyForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('radiogroup', { name: 'Sign in with GitHub through the platform' })
    await userEvent.click(within(canvas.getByRole('radiogroup', { name: 'Two-factor authentication' })).getByRole('radio', { name: 'Required' }))
    expect(canvas.getByText(/Off while passkeys or two-factor authentication are required/)).toBeVisible()
    await userEvent.click(within(row).getByRole('radio', { name: 'Off' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    expect(args.onSave).toHaveBeenCalledWith({ ...policyState.policy, twoFactor: 'required', platformSignIn: 'forbidden' })
  },
}

/** With an operator provider, the policy also says whether its staff may sign in as people, and whether they are told. */
export const SignInPolicyWithStaffAccess: StoryObj<SignInPolicyFormProps> = {
  tags: ['play'],
  args: { state: { ...policyState, operator: 'Protobase Cloud' }, onSave: fn() },
  render: (args) => <SignInPolicyForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(within(canvas.getByRole('radiogroup', { name: 'Staff sign-in as a person' })).getByRole('radio', { name: 'Email the person' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    expect(args.onSave).toHaveBeenCalledWith({ ...policyState.policy, staffAccess: 'notify' })
  },
}

export const SignInPolicyStaffAccessWithoutMail: StoryObj<SignInPolicyFormProps> = {
  tags: ['play'],
  args: {
    state: { ...policyState, operator: 'Protobase Cloud', mail: false, policy: { ...policyState.policy, staffAccess: 'notify' }, effective: { ...policyState.effective, emailCode: 'forbidden', staffAccess: 'forbidden' } },
    onSave: fn(),
  },
  render: (args) => <SignInPolicyForm {...args} />,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText(/staff cannot sign in until they are set/)).toBeVisible()
  },
}

const now = Date.parse('2026-10-10T12:10:00.000Z')
const staffSignIns: StaffSignIn[] = [
  { id: 's3', user: 'sanne@veldhuis-supply.example', staff: 'alex@protobase.example', staffName: 'Alex de Vries', reason: 'Ticket 4211: the invoice totals on SO-2 look wrong', startedAt: '2026-10-10T12:00:00.000Z', expiresAt: '2026-10-10T12:30:00.000Z' },
  { id: 's2', user: 'joris@veldhuis-supply.example', staff: 'alex@protobase.example', staffName: 'Alex de Vries', reason: 'Ticket 4198: cannot see the warehouse menu', startedAt: '2026-10-08T09:15:00.000Z', expiresAt: '2026-10-08T09:45:00.000Z', endedAt: '2026-10-08T09:22:00.000Z' },
  { id: 's1', user: 'sanne@veldhuis-supply.example', staff: 'staff-7', reason: 'Checking the import after the upgrade', startedAt: '2026-10-01T16:00:00.000Z', expiresAt: '2026-10-01T16:30:00.000Z' },
]

/** The admin's log of staff sign-ins on the sign-in policy page: a running session, a stopped one, and one that ran out. */
export const StaffSignIns: StoryObj<StaffSignInLogProps> = {
  tags: ['play'],
  args: { operator: 'Protobase Cloud', signIns: staffSignIns, now },
  render: (args) => <StaffSignInLog {...args} />,
  play: async ({ canvasElement }) => {
    const log = within(within(canvasElement).getByRole('region', { name: 'Staff sign-ins' }))
    expect(log.getAllByRole('listitem')).toHaveLength(3)
    expect(log.getByText(/Signed in until/)).toBeVisible()
    expect(log.getByText(/Stopped/)).toBeVisible()
    expect(log.getByText('Ticket 4211: the invoice totals on SO-2 look wrong')).toBeVisible()
  },
}

export const NoStaffSignIns: StoryObj<StaffSignInLogProps> = {
  args: { operator: 'Protobase Cloud', signIns: [], now },
  render: (args) => <StaffSignInLog {...args} />,
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

/** Someone who signs in with a password connects GitHub, whatever address it has; the platform's provider is listed too. */
export const ConnectedAccounts: StoryObj<SignInProvidersSectionProps> = {
  tags: ['play'],
  args: { providers: [{ id: 'github', name: 'GitHub' }, { id: 'oidc', name: 'Acme SSO' }], linked: ['oidc'], onConnect: fn(async () => undefined) },
  render: (args) => <SignInProvidersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Connected')).toBeVisible()
    expect(canvas.queryByRole('button', { name: 'Connect Acme SSO' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Connect GitHub' }))
    expect(args.onConnect).toHaveBeenCalledWith('github')
  },
}

export const ConnectedAccountsLinkRefused: StoryObj<SignInProvidersSectionProps> = {
  args: { providers: [{ id: 'github', name: 'GitHub' }], linked: [], onConnect: fn(async () => undefined), error: 'This GitHub account is linked to someone else here already.' },
  render: (args) => <SignInProvidersSection {...args} />,
}
