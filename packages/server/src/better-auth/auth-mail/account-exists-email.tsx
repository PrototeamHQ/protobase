import { Text } from 'react-email'
import { signInPath } from '@protobase/schema'
import { defineEmail } from '../../mail/define-email'
import { EmailButton, EmailLayout, EmailNote } from '../../mail/email-layout'
import type { MailingApp } from '../../mail/mailing-app'

export type AccountExistsData = { app: MailingApp }

const AccountExistsEmail = ({ app }: AccountExistsData) => (
  <EmailLayout app={app} preview={`Sign in to ${app.name} with this address instead`} heading="You already have an account">
    <Text>Someone asked to create an account with {app.name} for this address. It has one already, so no new account was made.</Text>
    <EmailButton href={new URL(signInPath(), app.url).href}>Sign in to {app.name}</EmailButton>
    <EmailNote>If this was not you, ignore this email: your account stays as it is.</EmailNote>
  </EmailLayout>
)

/** The email to an address that asked for a sign-up code while it has an account already: no code, a link to sign in instead. */
export const accountExistsEmail = defineEmail({ name: 'account-exists', subject: ({ app }: AccountExistsData) => `You already have an account with ${app.name}`, component: AccountExistsEmail })
