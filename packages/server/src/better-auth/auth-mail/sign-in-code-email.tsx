import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { EmailCode, EmailLayout, EmailNote } from '../../mail/email-layout'
import type { MailingApp } from '../../mail/mailing-app'

export type SignInCodeData = { app: MailingApp; code: string; lifetime: string }

const SignInCodeEmail = ({ app, code, lifetime }: SignInCodeData) => (
  <EmailLayout app={app} preview={`Your code to sign in to ${app.name}`} heading="Your sign-in code">
    <Text>Use this code to sign in to {app.name}:</Text>
    <EmailCode code={code} />
    <Text>It works for {lifetime}, once.</Text>
    <EmailNote>If you did not try to sign in, ignore this email: nobody can sign in without the code.</EmailNote>
  </EmailLayout>
)

/** The email with a code to sign in with instead of a password. */
export const signInCodeEmail = defineEmail({ name: 'sign-in-code', subject: ({ app, code }: SignInCodeData) => `${code} is your ${app.name} sign-in code`, component: SignInCodeEmail })
