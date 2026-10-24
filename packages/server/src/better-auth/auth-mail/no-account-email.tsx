import { Text } from 'react-email'
import { signInPath } from '@protobase/schema'
import { defineEmail } from '../../mail/define-email'
import { EmailButton, EmailLayout, EmailNote } from '../../mail/email-layout'
import type { MailingApp } from '../../mail/mailing-app'

export type NoAccountData = { app: MailingApp }

const NoAccountEmail = ({ app }: NoAccountData) => (
  <EmailLayout app={app} preview={`No ${app.name} account uses this address`} heading="No account for this address">
    <Text>Someone asked for a code to sign in to {app.name} with this address. No account uses it, so no code was sent.</Text>
    <Text>If you have an account, sign in again with the address you signed up with.</Text>
    <EmailButton href={new URL(signInPath(), app.url).href}>Sign in to {app.name}</EmailButton>
    <EmailNote>If this was not you, ignore this email: nothing was changed.</EmailNote>
  </EmailLayout>
)

/** The email to an address that asked for a sign-in code while no account uses it: no code, a hint to try another address. */
export const noAccountEmail = defineEmail({ name: 'no-account', subject: ({ app }: NoAccountData) => `No ${app.name} account uses this address`, component: NoAccountEmail })
