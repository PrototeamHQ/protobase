import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { EmailCodeForm, type EmailCodeFormProps } from './email-code-form'
import { FirstRunPage } from './first-run-page'
import { ForgotPasswordForm, type ForgotPasswordFormProps } from './forgot-password-form'
import { ResetPasswordForm, type ResetPasswordFormProps } from './reset-password-form'
import { SetupRequiredForm, type SetupRequiredFormProps } from './setup-required-form'
import { SignInForm, type SignInFormProps } from './sign-in-form'
import { StaffSignInForm, type StaffSignInFormProps } from './staff-sign-in-form'
import { TwoFactorForm, type TwoFactorFormProps } from './two-factor-form'

const meta = { title: 'Auth', parameters: { layout: 'fullscreen' }, decorators: [(Story) => <div className="h-screen"><Story /></div>] } satisfies Meta
export default meta

export const SignIn: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email'), 'sanne@veldhuis-supply.example')
    await userEvent.type(canvas.getByLabelText('Password'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
    expect(args.onSubmit).toHaveBeenCalledWith('sanne@veldhuis-supply.example', 'correct horse battery')
  },
}

export const SignInWithGitHub: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onContinueWithGitHub: fn(), workspace: 'Protobase Cloud' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Continue with GitHub' }))
    expect(args.onContinueWithGitHub).toHaveBeenCalledOnce()
    expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const SignInFailed: StoryObj<SignInFormProps> = {
  args: { onSubmit: fn(), error: 'The email or password is not right.' },
  render: (args) => <SignInForm {...args} />,
}

export const SigningIn: StoryObj<SignInFormProps> = {
  args: { onSubmit: fn(), busy: true },
  render: (args) => <SignInForm {...args} />,
}

export const SignInWithPasswordReset: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onForgotPassword: fn(), workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Forgot password?' }))
    expect(args.onForgotPassword).toHaveBeenCalledOnce()
  },
}

export const SignInAfterPasswordReset: StoryObj<SignInFormProps> = {
  args: { onSubmit: fn(), onForgotPassword: fn(), notice: 'Your password is changed. Sign in with the new one.' },
  render: (args) => <SignInForm {...args} />,
}

export const SignInWithEveryMethod: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onSendCode: fn(), onPasskey: fn(), onForgotPassword: fn(), methods: ['password', 'emailCode', 'passkey'], workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in with a passkey' }))
    expect(args.onPasskey).toHaveBeenCalledOnce()
    // The code needs only the address, not the password.
    await userEvent.click(canvas.getByRole('button', { name: 'Email me a sign-in code' }))
    expect(args.onSendCode).not.toHaveBeenCalled()
    await userEvent.type(canvas.getByLabelText('Email'), 'sanne@veldhuis-supply.example')
    await userEvent.click(canvas.getByRole('button', { name: 'Email me a sign-in code' }))
    expect(args.onSendCode).toHaveBeenCalledWith('sanne@veldhuis-supply.example')
    expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const SignInWithoutPasswords: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onSendCode: fn(), onPasskey: fn(), onForgotPassword: fn(), methods: ['emailCode', 'passkey'], workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByLabelText('Password')).toBeNull()
    expect(canvas.queryByRole('button', { name: 'Forgot password?' })).toBeNull()
    await userEvent.type(canvas.getByLabelText('Email'), 'sanne@veldhuis-supply.example{enter}')
    expect(args.onSendCode).toHaveBeenCalledWith('sanne@veldhuis-supply.example')
  },
}

export const EmailCode: StoryObj<EmailCodeFormProps> = {
  tags: ['play'],
  args: { email: 'sanne@veldhuis-supply.example', onSubmit: fn(), onResend: fn(), onBack: fn() },
  render: (args) => <EmailCodeForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('sanne@veldhuis-supply.example')).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Code'), '482913')
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
    expect(args.onSubmit).toHaveBeenCalledWith('482913')
    await userEvent.click(canvas.getByRole('button', { name: 'Send a new code' }))
    expect(args.onResend).toHaveBeenCalledOnce()
  },
}

export const EmailCodeWrong: StoryObj<EmailCodeFormProps> = {
  args: { email: 'sanne@veldhuis-supply.example', onSubmit: fn(), onResend: fn(), onBack: fn(), error: 'The code is not right.' },
  render: (args) => <EmailCodeForm {...args} />,
}

export const TwoFactorWithApp: StoryObj<TwoFactorFormProps> = {
  tags: ['play'],
  args: { methods: ['totp', 'otp'], onVerify: fn(), onSendCode: fn(), onBack: fn() },
  render: (args) => <TwoFactorForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Enter the 6-digit code from your authenticator app.')).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Code'), '123456')
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Trust this browser' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Verify' }))
    expect(args.onVerify).toHaveBeenCalledWith({ method: 'totp', code: '123456', trustDevice: true })
    await userEvent.click(canvas.getByRole('button', { name: 'Use a backup code' }))
    await userEvent.type(canvas.getByLabelText('Backup code'), 'Xk3pQ-9vTzA')
    await userEvent.click(canvas.getByRole('button', { name: 'Verify' }))
    expect(args.onVerify).toHaveBeenLastCalledWith({ method: 'backup', code: 'Xk3pQ-9vTzA', trustDevice: true })
    await userEvent.click(canvas.getByRole('button', { name: 'Email me a code instead' }))
    expect(args.onSendCode).toHaveBeenCalledOnce()
  },
}

export const TwoFactorByEmail: StoryObj<TwoFactorFormProps> = {
  tags: ['play'],
  args: { methods: ['otp'], onVerify: fn(), onSendCode: fn(), onBack: fn() },
  render: (args) => <TwoFactorForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByRole('button', { name: 'Use a backup code' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Email me a code' }))
    expect(args.onSendCode).toHaveBeenCalledOnce()
  },
}

export const TwoFactorEmailSent: StoryObj<TwoFactorFormProps> = {
  args: { methods: ['totp', 'otp'], initialStep: 'otp', codeSent: true, onVerify: fn(), onSendCode: fn(), onBack: fn(), error: 'The code is not right.' },
  render: (args) => <TwoFactorForm {...args} />,
}

const twoFactorSetup = { offerEmailedCodes: true, needsPassword: true, onStartApp: fn(async () => ({ totpURI: 'otpauth://totp/Protobase:sanne%40veldhuis-supply.example?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Protobase', backupCodes: [] })), onConfirmApp: fn(async () => undefined), onEmailedCodes: fn(async () => undefined), onDone: fn() }

export const SetupTwoFactorRequired: StoryObj<SetupRequiredFormProps> = {
  tags: ['play'],
  args: { step: 'twoFactor', twoFactor: twoFactorSetup, onAddPasskey: fn(), onSignOut: fn() },
  render: (args) => <SetupRequiredForm {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Turn on two-factor authentication')).toBeVisible()
    expect(canvas.getByRole('radio', { name: /Authenticator app/ })).toHaveAttribute('aria-checked', 'true')
    await userEvent.type(canvas.getByLabelText('Your password'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }))
    expect(twoFactorSetup.onStartApp).toHaveBeenCalledWith('correct horse battery')
    expect(await canvas.findByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible()
    expect(canvas.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeVisible()
  },
}

export const SetupPasskeyRequired: StoryObj<SetupRequiredFormProps> = {
  tags: ['play'],
  args: { step: 'passkey', twoFactor: twoFactorSetup, onAddPasskey: fn(), onSignOut: fn() },
  render: (args) => <SetupRequiredForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add a passkey' }))
    expect(args.onAddPasskey).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Sign out' }))
    expect(args.onSignOut).toHaveBeenCalledOnce()
  },
}

export const SetupPasskeyCancelled: StoryObj<SetupRequiredFormProps> = {
  args: { step: 'passkey', twoFactor: twoFactorSetup, onAddPasskey: fn(), onSignOut: fn(), error: 'The passkey prompt closed before it finished. Try again.' },
  render: (args) => <SetupRequiredForm {...args} />,
}

export const ForgotPassword: StoryObj<ForgotPasswordFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onBack: fn() },
  render: (args) => <ForgotPasswordForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email'), 'sanne@veldhuis-supply.example ')
    await userEvent.click(canvas.getByRole('button', { name: 'Send reset link' }))
    expect(args.onSubmit).toHaveBeenCalledWith('sanne@veldhuis-supply.example')
    await userEvent.click(canvas.getByRole('button', { name: 'Back to sign in' }))
    expect(args.onBack).toHaveBeenCalledOnce()
  },
}

export const ForgotPasswordSent: StoryObj<ForgotPasswordFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onBack: fn(), sentTo: 'sanne@veldhuis-supply.example' },
  render: (args) => <ForgotPasswordForm {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Check your email')).toBeVisible()
    expect(canvas.getByText('sanne@veldhuis-supply.example')).toBeVisible()
  },
}

export const ForgotPasswordRateLimited: StoryObj<ForgotPasswordFormProps> = {
  args: { onSubmit: fn(), onBack: fn(), error: 'Too many requests. Wait a minute and try again.' },
  render: (args) => <ForgotPasswordForm {...args} />,
}

export const ResetPassword: StoryObj<ResetPasswordFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onBack: fn(), onRequestNewLink: fn() },
  render: (args) => <ResetPasswordForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('New password'), 'a much longer password')
    await userEvent.type(canvas.getByLabelText('Repeat new password'), 'a much longer passw0rd')
    await userEvent.click(canvas.getByRole('button', { name: 'Set new password' }))
    expect(canvas.getByRole('alert')).toHaveTextContent('The passwords are not the same.')
    expect(args.onSubmit).not.toHaveBeenCalled()
    await userEvent.clear(canvas.getByLabelText('Repeat new password'))
    await userEvent.type(canvas.getByLabelText('Repeat new password'), 'a much longer password')
    await userEvent.click(canvas.getByRole('button', { name: 'Set new password' }))
    expect(args.onSubmit).toHaveBeenCalledWith('a much longer password')
  },
}

export const ResetPasswordRefused: StoryObj<ResetPasswordFormProps> = {
  args: { onSubmit: fn(), onBack: fn(), error: 'Use at least 12 characters.' },
  render: (args) => <ResetPasswordForm {...args} />,
}

export const ResetLinkExpired: StoryObj<ResetPasswordFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onBack: fn(), onRequestNewLink: fn(), invalidLink: true },
  render: (args) => <ResetPasswordForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('This link no longer works')).toBeVisible()
    expect(canvas.queryByLabelText('New password')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Send a new link' }))
    expect(args.onRequestNewLink).toHaveBeenCalledOnce()
  },
}

export const FirstRun: StoryObj = {
  tags: ['play'],
  render: () => <FirstRunPage onCheckAgain={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('No admin yet')).toBeVisible()
    expect(canvas.getByText(/protobase users create/)).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Reload' })).toBeEnabled()
  },
}

export const SignInOnPhone: StoryObj<SignInFormProps> = {
  globals: { viewport: { value: 'phone360' } },
  parameters: { viewport: { options: { phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } } },
  args: { onSubmit: fn() },
  render: (args) => <SignInForm {...args} />,
}

/** For staff of the operator, from a support tool's link that fills in the person and the reason. */
export const StaffSignIn: StoryObj<StaffSignInFormProps> = {
  tags: ['play'],
  args: { operator: 'Protobase Cloud', email: 'sanne@veldhuis-supply.example', onSubmit: fn(), onBack: fn() },
  render: (args) => <StaffSignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByLabelText('Their email')).toHaveValue('sanne@veldhuis-supply.example')
    await userEvent.type(canvas.getByLabelText('Reason'), 'Ticket 4211: the invoice totals look wrong')
    await userEvent.click(canvas.getByRole('button', { name: 'Continue with Protobase Cloud' }))
    expect(args.onSubmit).toHaveBeenCalledWith('sanne@veldhuis-supply.example', 'Ticket 4211: the invoice totals look wrong')
  },
}

export const StaffSignInRefused: StoryObj<StaffSignInFormProps> = {
  args: {
    operator: 'Protobase Cloud',
    email: 'sanne@veldhuis-supply.example',
    reason: 'Ticket 4211: the invoice totals look wrong',
    error: 'Sign in to your staff account with a passkey or a second step, then try again.',
    onSubmit: fn(),
    onBack: fn(),
  },
  render: (args) => <StaffSignInForm {...args} />,
}

export const StaffSignInUnavailable: StoryObj<StaffSignInFormProps> = {
  args: { onSubmit: fn(), onBack: fn() },
  render: (args) => <StaffSignInForm {...args} />,
}
