import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { AuthEmailLayout, EmailButton, EmailNote } from './auth-email-layout'
import type { MailingApp } from './mailing-app'

export type InvitationData = { app: MailingApp; inviter: string; organization: string; url: string; expiresAt: Date }

const InvitationEmail = ({ app, inviter, organization, url, expiresAt }: InvitationData) => (
  <AuthEmailLayout app={app} preview={`${inviter} invites you to join ${organization}`} heading={`Join ${organization}`}>
    <Text>
      {inviter} invites you to join {organization} on {app.name}. To accept, open this link:
    </Text>
    <EmailButton href={url}>Accept the invitation</EmailButton>
    <Text>The link works until {expiresAt.toUTCString()}.</Text>
    <EmailNote>If you do not want to join, ignore this email: nothing happens without you.</EmailNote>
  </AuthEmailLayout>
)

/** The invitation email: who invites whom to which organization, the link, and until when it works. */
export const invitationEmail = defineEmail({ name: 'invitation', subject: ({ organization, app }: InvitationData) => `Join ${organization} on ${app.name}`, component: InvitationEmail })
