import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { EmailCode, EmailLayout, EmailNote } from '../../mail/email-layout'
import type { MailingApp } from '../../mail/mailing-app'

export type SignUpCodeData = { app: MailingApp; code: string; lifetime: string }

const SignUpCodeEmail = ({ app, code, lifetime }: SignUpCodeData) => (
  <EmailLayout app={app} preview={`Your code to create an account with ${app.name}`} heading="Create your account">
    <Text>Use this code to create your account with {app.name}:</Text>
    <EmailCode code={code} />
    <Text>It works for {lifetime}, once.</Text>
    <EmailNote>If you did not try to create an account, ignore this email: nobody can create one for your address without the code.</EmailNote>
  </EmailLayout>
)

/** The email with the code that makes an account for the address. */
export const signUpCodeEmail = defineEmail({ name: 'sign-up-code', subject: ({ app }: SignUpCodeData) => `Your code to create an account with ${app.name}`, component: SignUpCodeEmail })
