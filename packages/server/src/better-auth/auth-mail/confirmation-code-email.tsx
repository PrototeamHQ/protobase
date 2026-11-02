import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { EmailCode, EmailLayout, EmailNote } from '../../mail/email-layout'
import type { MailingApp } from '../../mail/mailing-app'

export type ConfirmationCodeData = { app: MailingApp; code: string; lifetime: string }

const ConfirmationCodeEmail = ({ app, code, lifetime }: ConfirmationCodeData) => (
  <EmailLayout app={app} preview={`Your code to confirm it's you in ${app.name}`} heading="Confirm it's you">
    <Text>You are signed in to {app.name} and asked to confirm it's you. Use this code there:</Text>
    <EmailCode code={code} />
    <Text>It works for {lifetime}, once, and only where you asked for it. It does not sign you in.</Text>
    <EmailNote>If you did not ask for it, someone may be signed in to your account: sign out of your other devices on your account page.</EmailNote>
  </EmailLayout>
)

/** The email with a code that confirms it's them inside a signed-in session, for an account without a passkey or a second step. */
export const confirmationCodeEmail = defineEmail({
  name: 'confirmation-code',
  subject: ({ app, code }: ConfirmationCodeData) => `${code} confirms it's you in ${app.name}`,
  component: ConfirmationCodeEmail,
})
