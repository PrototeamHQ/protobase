import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { AuthEmailLayout, EmailCode, EmailNote } from './auth-email-layout'
import type { MailingApp } from './mailing-app'

export type TwoFactorCodeData = { app: MailingApp; code: string; lifetime: string }

const TwoFactorCodeEmail = ({ app, code, lifetime }: TwoFactorCodeData) => (
  <AuthEmailLayout app={app} preview={`Your code to finish signing in to ${app.name}`} heading="Finish signing in">
    <Text>Use this code to finish signing in to {app.name}:</Text>
    <EmailCode code={code} />
    <Text>It works for {lifetime}, once.</Text>
    <EmailNote>If you did not just sign in, someone else may know your password or have your sign-in code: change your password.</EmailNote>
  </AuthEmailLayout>
)

/** The email with the second step of a sign-in, for an account with two-factor authentication by email. */
export const twoFactorCodeEmail = defineEmail({ name: 'two-factor-code', subject: ({ app }: TwoFactorCodeData) => `Your ${app.name} verification code`, component: TwoFactorCodeEmail })
