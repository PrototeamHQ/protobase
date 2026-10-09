import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { FirstRunPage } from './first-run-page'
import { ForgotPasswordForm, type ForgotPasswordFormProps } from './forgot-password-form'
import { ResetPasswordForm, type ResetPasswordFormProps } from './reset-password-form'
import { SignInForm, type SignInFormProps } from './sign-in-form'

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
