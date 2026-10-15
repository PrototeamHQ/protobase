import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { AuthEmailLayout, EmailButton, EmailNote } from './auth-email-layout'
import type { MailingApp } from './mailing-app'

export type ResetPasswordData = { app: MailingApp; url: string; lifetime: string }

const ResetPasswordEmail = ({ app, url, lifetime }: ResetPasswordData) => (
  <AuthEmailLayout app={app} preview={`Choose a new password for ${app.name}`} heading="Reset your password">
    <Text>Someone asked to reset the password of your account with {app.name}. To choose a new password, open this link:</Text>
    <EmailButton href={url}>Choose a new password</EmailButton>
    <Text>The link works for {lifetime}, once.</Text>
    <EmailNote>If you did not ask for this, ignore this email: your password stays as it is.</EmailNote>
  </AuthEmailLayout>
)

/** The reset email: the link, how long it works, and that it can be ignored. */
export const resetPasswordEmail = defineEmail({ name: 'reset-password', subject: ({ app }: ResetPasswordData) => `Reset your ${app.name} password`, component: ResetPasswordEmail })
