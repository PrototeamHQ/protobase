import { Text } from 'react-email'
import { signInPath } from '@protobase/schema'
import { defineEmail } from '../../mail/define-email'
import { EmailButton, EmailLayout, EmailNote } from '../../mail/email-layout'
import type { MailingApp } from '../../mail/mailing-app'

export type PasswordChangedData = { app: MailingApp }

const PasswordChangedEmail = ({ app }: PasswordChangedData) => (
  <EmailLayout app={app} preview={`The password of your ${app.name} account was changed`} heading="Your password was changed">
    <Text>The password of your account with {app.name} was just changed.</Text>
    <Text>If this was not you, choose a new password at once with "Forgot password?" on the sign-in page:</Text>
    <EmailButton href={new URL(signInPath({ step: 'forgot-password' }), app.url).href}>Choose a new password</EmailButton>
    <EmailNote>If this was you, ignore this email.</EmailNote>
  </EmailLayout>
)

/** The email to an account whose password changed: what happened, and how to take the account back if it was not them. */
export const passwordChangedEmail = defineEmail({ name: 'password-changed', subject: ({ app }: PasswordChangedData) => `Your ${app.name} password was changed`, component: PasswordChangedEmail })
