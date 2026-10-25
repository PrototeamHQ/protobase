import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { EmailCode, EmailLayout, EmailNote } from '../../mail/email-layout'
import type { MailingApp } from '../../mail/mailing-app'

export type ChangeEmailCodeData = { app: MailingApp; code: string; lifetime: string }

const ChangeEmailCodeEmail = ({ app, code, lifetime }: ChangeEmailCodeData) => (
  <EmailLayout app={app} preview={`Your code to sign in to ${app.name} with this address`} heading="Confirm your new address">
    <Text>Use this code to sign in to {app.name} with this address from now on:</Text>
    <EmailCode code={code} />
    <Text>It works for {lifetime}, once.</Text>
    <EmailNote>If you did not ask for this, ignore this email: nobody can move an account to your address without the code.</EmailNote>
  </EmailLayout>
)

/** The email to the new address with the code that moves the account to it. */
export const changeEmailCodeEmail = defineEmail({ name: 'change-email-code', subject: ({ app }: ChangeEmailCodeData) => `Confirm your new ${app.name} address`, component: ChangeEmailCodeEmail })
