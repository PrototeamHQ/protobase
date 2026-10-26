import { useState, type CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { signInPath, type SignInStep } from '@protobase/schema'
import { providerMessage } from './auth-messages'
import { EmailCodeForm, type EmailCodeFormProps } from './email-code-form'
import { FirstRunPage } from './first-run-page'
import { ForgotPasswordForm, type ForgotPasswordFormProps } from './forgot-password-form'
import { ProviderRedirect } from './provider-sign-in-page'
import { ResetPasswordForm, type ResetPasswordFormProps } from './reset-password-form'
import { SetupRequiredForm, type SetupRequiredFormProps } from './setup-required-form'
import { SignInForm, type SignInFormProps } from './sign-in-form'
import { SignUpCodeForm, type SignUpCodeFormProps } from './sign-up-code-form'
import { SignUpDetailsForm, type SignUpDetailsFormProps } from './sign-up-details-form'
import { SignUpEmailForm, type SignUpEmailFormProps } from './sign-up-email-form'
import { StaffSignInForm, type StaffSignInFormProps } from './staff-sign-in-form'
import { TwoFactorForm, type TwoFactorFormProps } from './two-factor-form'
import { text } from './messages'

const meta = { title: 'Auth', parameters: { layout: 'fullscreen' }, decorators: [(Story) => <div className="h-screen"><Story /></div>] } satisfies Meta
export default meta

// A step of the sign-in route as the forms link to it, followed in place with a spy.
const stepLink = (step: SignInStep) => ({ href: signInPath({ step }), onFollow: fn() })

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
  args: { onSubmit: fn(), providers: [{ id: 'github', name: 'GitHub' }], onContinueWith: fn(), workspace: 'Protobase Cloud' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Continue with GitHub' })
    expect(button.querySelector('svg')).toBeVisible()
    await userEvent.click(button)
    expect(args.onContinueWith).toHaveBeenCalledWith('github')
    expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/** The platform's own sign-in provider sits beside the app's, under the name the platform gives it. */
export const SignInWithPlatformProvider: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), providers: [{ id: 'github', name: 'GitHub' }, { id: 'oidc', name: 'Acme SSO' }], onContinueWith: fn(), workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // The GitHub mark is GitHub's alone, chosen by the provider's id, not its name.
    expect(canvas.getByRole('button', { name: 'Continue with GitHub' }).querySelector('svg')).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Continue with Acme SSO' }).querySelector('svg')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Continue with Acme SSO' }))
    expect(args.onContinueWith).toHaveBeenCalledWith('oidc')
  },
}

/** A link such as `/?sign-in=github` leaves for the provider at once, so someone it knows lands signed in. */
export const SigningInWithProvider: StoryObj<{ name: string; workspace?: string }> = {
  tags: ['play'],
  args: { name: 'GitHub', workspace: 'Veldhuis Supply' },
  render: (args) => <ProviderRedirect {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('heading', { name: 'Signing in with GitHub' })).toBeVisible()
    expect(canvas.getByRole('status')).toHaveTextContent('Taking you to GitHub…')
  },
}

/** The provider knew the person, but no account here is theirs: the sign-in page says so, with the other ways in. */
export const SignInProviderRefused: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: {
    onSubmit: fn(),
    providers: [{ id: 'github', name: 'GitHub' }],
    onContinueWith: fn(),
    workspace: 'Veldhuis Supply',
    error: providerMessage('signup_disabled', 'GitHub'),
  },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('alert')).toHaveTextContent('No account here belongs to this GitHub account.')
    expect(canvas.getByRole('button', { name: 'Continue with GitHub' })).toBeEnabled()
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
  args: { onSubmit: fn(), forgotPassword: stepLink('forgot-password'), workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const link = within(canvasElement).getByRole('link', { name: 'Forgot password?' })
    expect(link).toHaveAttribute('href', signInPath({ step: 'forgot-password' }))
    await userEvent.click(link)
    expect(args.forgotPassword!.onFollow).toHaveBeenCalledOnce()
  },
}

export const SignInAfterPasswordReset: StoryObj<SignInFormProps> = {
  args: { onSubmit: fn(), forgotPassword: stepLink('forgot-password'), notice: 'Your password is changed. Sign in with the new one.' },
  render: (args) => <SignInForm {...args} />,
}

export const SignInWithEveryMethod: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onSendCode: fn(), onPasskey: fn(), forgotPassword: stepLink('forgot-password'), methods: ['password', 'emailCode', 'passkey'], workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in with a passkey' }))
    expect(args.onPasskey).toHaveBeenCalledOnce()
    // By default the form leads with the password, with the code below it.
    expect(canvas.getByLabelText('Password')).toBeVisible()
    expect(canvas.queryByRole('button', { name: 'Use a password' })).toBeNull()
    // The code needs only the address, not the password.
    await userEvent.click(canvas.getByRole('button', { name: 'Email me a sign-in code' }))
    expect(args.onSendCode).not.toHaveBeenCalled()
    await userEvent.type(canvas.getByLabelText('Email'), 'sanne@veldhuis-supply.example')
    await userEvent.click(canvas.getByRole('button', { name: 'Email me a sign-in code' }))
    expect(args.onSendCode).toHaveBeenCalledWith('sanne@veldhuis-supply.example')
    expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/** With `first: 'emailCode'` the form leads with emailing a code; the password, and its reset link, wait behind "Use a password". */
export const SignInWithCodeFirst: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onSendCode: fn(), forgotPassword: stepLink('forgot-password'), methods: ['password', 'emailCode'], first: 'emailCode', workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByLabelText('Password')).toBeNull()
    expect(canvas.queryByRole('link', { name: 'Forgot password?' })).toBeNull()
    await userEvent.type(canvas.getByLabelText('Email'), 'sanne@veldhuis-supply.example{enter}')
    expect(args.onSendCode).toHaveBeenCalledWith('sanne@veldhuis-supply.example')
    await userEvent.click(canvas.getByRole('button', { name: 'Use a password' }))
    expect(canvas.queryByRole('button', { name: 'Use a password' })).toBeNull()
    expect(canvas.getByRole('link', { name: 'Forgot password?' })).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Password'), 'correct horse battery{enter}')
    expect(args.onSubmit).toHaveBeenCalledWith('sanne@veldhuis-supply.example', 'correct horse battery')
    expect(args.onSendCode).toHaveBeenCalledOnce()
  },
}

export const SignInWithPasskeysOfTwoDomains: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onPasskey: fn(), methods: ['password', 'passkey'], passkeyDomains: ['admin.veldhuis-supply.example', 'erp-x1.protobase.net'], workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in with a passkey' }))
    expect(args.onPasskey).toHaveBeenLastCalledWith()
    await userEvent.click(canvas.getByRole('button', { name: 'Use a passkey made for erp-x1.protobase.net' }))
    expect(args.onPasskey).toHaveBeenLastCalledWith('erp-x1.protobase.net')
  },
}

export const SignInWithoutPasswords: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onSendCode: fn(), onPasskey: fn(), forgotPassword: stepLink('forgot-password'), methods: ['emailCode', 'passkey'], workspace: 'Veldhuis Supply' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByLabelText('Password')).toBeNull()
    expect(canvas.queryByRole('link', { name: 'Forgot password?' })).toBeNull()
    await userEvent.type(canvas.getByLabelText('Email'), 'sanne@veldhuis-supply.example{enter}')
    expect(args.onSendCode).toHaveBeenCalledWith('sanne@veldhuis-supply.example')
  },
}

/**
 * A whole code signs in by itself; "Sign in" sends it again, and a new code can be asked for once the wait is over. The
 * code is one field the system fills from Mail or Messages, with the phone's digit keyboard.
 */
export const EmailCode: StoryObj<EmailCodeFormProps> = {
  tags: ['play'],
  args: { email: 'sanne@veldhuis-supply.example', onSubmit: fn(), onResend: fn(), onBack: fn(), resendCooldown: 0 },
  render: (args) => <EmailCodeForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('sanne@veldhuis-supply.example')).toBeVisible()
    expect(canvasElement.querySelectorAll('input')).toHaveLength(1)
    const code = canvas.getByLabelText('Code')
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    expect(code).toHaveAttribute('inputmode', 'numeric')
    expect(code).toHaveAttribute('pattern', '[0-9]{6}')
    await userEvent.type(code, '482913')
    expect(args.onSubmit).toHaveBeenCalledOnce()
    expect(args.onSubmit).toHaveBeenCalledWith('482913')
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
    expect(args.onSubmit).toHaveBeenCalledTimes(2)
    await userEvent.click(canvas.getByRole('button', { name: 'Send a new code' }))
    expect(args.onResend).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Back to sign in' }))
    expect(args.onBack).toHaveBeenCalledOnce()
  },
}

// The form as the sign-in page holds it: a new code that went out shows a notice.
const ResendingEmailCodeForm = ({ onResend, ...props }: EmailCodeFormProps) => {
  const [notice, setNotice] = useState<string>()
  return (
    <EmailCodeForm
      {...props}
      notice={notice}
      onResend={() => {
        onResend()
        setNotice(text('newCodeSent'))
      }}
    />
  )
}

/** A new code empties the boxes of the old one and puts the caret back in them, ready for the new code. */
export const EmailCodeResent: StoryObj<EmailCodeFormProps> = {
  tags: ['play'],
  args: { email: 'sanne@veldhuis-supply.example', onSubmit: fn(), onResend: fn(), onBack: fn(), resendCooldown: 0 },
  render: (args) => <ResendingEmailCodeForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const code = canvas.getByLabelText('Code')
    await userEvent.type(code, '482')
    await userEvent.click(canvas.getByRole('button', { name: 'Send a new code' }))
    expect(args.onResend).toHaveBeenCalledOnce()
    expect(await canvas.findByRole('status')).toHaveTextContent(text('newCodeSent'))
    expect(code).toHaveValue('')
    expect(code).toHaveFocus()
  },
}

/**
 * On a phone with the keyboard open, which the iOS and Android app shrink the page to the space above, the status bar
 * still over its top: the code step shows whole between the two, with nothing to scroll to.
 */
export const EmailCodeAboveKeyboard: StoryObj<EmailCodeFormProps> = {
  tags: ['play', 'keyboard'],
  args: { email: 'sanne@veldhuis-supply.example', onSubmit: fn(), onResend: fn(), onBack: fn(), resendCooldown: 0 },
  render: (args) => (
    <div className="h-full" style={{ '--pb-safe-top': '62px' } as CSSProperties}>
      <EmailCodeForm {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(document.documentElement.scrollHeight).toBe(window.innerHeight)
    expect(canvas.getByRole('heading', { name: text('checkEmail') }).getBoundingClientRect().top).toBeGreaterThanOrEqual(62)
    expect(canvas.getByRole('button', { name: 'Back to sign in' }).getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
  },
}

export const SignInWithSignUp: StoryObj<SignInFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), signUp: stepLink('sign-up'), workspace: 'Homes' },
  render: (args) => <SignInForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const link = within(canvasElement).getByRole('link', { name: 'Create an account' })
    expect(link).toHaveAttribute('href', signInPath({ step: 'sign-up' }))
    await userEvent.click(link)
    expect(args.signUp!.onFollow).toHaveBeenCalledOnce()
  },
}

export const SignUpEmail: StoryObj<SignUpEmailFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), onSignIn: fn(), onBrowse: fn(), workspace: 'Homes' },
  render: (args) => <SignUpEmailForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email'), 'nia@homes.example')
    await userEvent.click(canvas.getByRole('button', { name: 'Email me a code' }))
    expect(args.onSubmit).toHaveBeenCalledWith('nia@homes.example')
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
    expect(args.onSignIn).toHaveBeenCalledOnce()
  },
}

/** The code on its own, before anything else: a whole code checks itself, and a new one waits 30 seconds after the last. */
export const SignUpCode: StoryObj<SignUpCodeFormProps> = {
  tags: ['play'],
  args: { email: 'nia@homes.example', onSubmit: fn(), onResend: fn(), onBack: fn() },
  render: (args) => <SignUpCodeForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(canvas.getByText('nia@homes.example')).toBeVisible()
    expect(canvas.queryByLabelText('Your name')).toBeNull()
    expect(canvas.getByRole('button', { name: /^Send a new code in \d+s$/ })).toBeDisabled()
    await userEvent.type(canvas.getByLabelText('Code'), '246810')
    expect(args.onSubmit).toHaveBeenCalledOnce()
    expect(args.onSubmit).toHaveBeenCalledWith('246810')
    await userEvent.click(canvas.getByRole('button', { name: 'Use another address' }))
    expect(args.onBack).toHaveBeenCalledOnce()
  },
}

/** The code was not right: every box in the danger colour, with why. */
export const SignUpCodeWrong: StoryObj<SignUpCodeFormProps> = {
  args: { email: 'nia@homes.example', onSubmit: fn(), onResend: fn(), onBack: fn(), error: 'The code is not right, or has expired. Ask for a new one.' },
  render: (args) => <SignUpCodeForm {...args} />,
}

export const SignUpCodeOnPhone: StoryObj<SignUpCodeFormProps> = {
  globals: { viewport: { value: 'phone360' } },
  parameters: { viewport: { options: { phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } } },
  args: { email: 'nia@homes.example', onSubmit: fn(), onResend: fn(), onBack: fn() },
  render: (args) => <SignUpCodeForm {...args} />,
}

/** Once the code was right: the name and how they sign in, with no code to enter again. */
export const SignUpDetails: StoryObj<SignUpDetailsFormProps> = {
  tags: ['play'],
  args: { email: 'nia@homes.example', methods: ['password', 'emailCode', 'passkey'], onSubmit: fn(), onBack: fn() },
  render: (args) => <SignUpDetailsForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('nia@homes.example')).toBeVisible()
    expect(canvas.queryByLabelText('Code')).toBeNull()
    await userEvent.type(canvas.getByLabelText('Your name'), 'Nia')
    // With emailed codes on, the password can stay empty
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }))
    expect(args.onSubmit).toHaveBeenCalledWith({ name: 'Nia' })
    await userEvent.type(canvas.getByLabelText('Password (optional)'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }))
    expect(args.onSubmit).toHaveBeenLastCalledWith({ name: 'Nia', password: 'correct horse battery' })
  },
}

export const SignUpDetailsPasswordOnly: StoryObj<SignUpDetailsFormProps> = {
  tags: ['play'],
  args: { email: 'nia@homes.example', methods: ['password'], onSubmit: fn(), onBack: fn(), error: 'This sign-up took too long. Start again with your email address.' },
  render: (args) => <SignUpDetailsForm {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByLabelText('Password')).toBeRequired()
    expect(canvas.getByRole('alert')).toHaveTextContent('This sign-up took too long')
  },
}

export const EmailCodeWrong: StoryObj<EmailCodeFormProps> = {
  args: { email: 'sanne@veldhuis-supply.example', onSubmit: fn(), onResend: fn(), onBack: fn(), error: 'The code is not right, or has expired. Ask for a new one.' },
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
  args: { onSubmit: fn(), back: stepLink('sign-in') },
  render: (args) => <ForgotPasswordForm {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email'), 'sanne@veldhuis-supply.example ')
    await userEvent.click(canvas.getByRole('button', { name: 'Send reset link' }))
    expect(args.onSubmit).toHaveBeenCalledWith('sanne@veldhuis-supply.example')
    await userEvent.click(canvas.getByRole('link', { name: 'Back to sign in' }))
    expect(args.back.onFollow).toHaveBeenCalledOnce()
  },
}

export const ForgotPasswordSent: StoryObj<ForgotPasswordFormProps> = {
  tags: ['play'],
  args: { onSubmit: fn(), back: stepLink('sign-in'), sentTo: 'sanne@veldhuis-supply.example' },
  render: (args) => <ForgotPasswordForm {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Check your email')).toBeVisible()
    expect(canvas.getByText('sanne@veldhuis-supply.example')).toBeVisible()
  },
}

export const ForgotPasswordRateLimited: StoryObj<ForgotPasswordFormProps> = {
  args: { onSubmit: fn(), back: stepLink('sign-in'), error: 'Too many requests. Wait a minute and try again.' },
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
