import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { AuthEmailLayout, EmailButton, EmailNote } from './auth-email-layout'
import type { MailingApp } from './mailing-app'

/** Without `organization`, the invitation is to the app itself. */
export type InvitationData = { app: MailingApp; inviter: string; organization?: string; url: string; expiresAt: Date }

const InvitationEmail = ({ app, inviter, organization, url, expiresAt }: InvitationData) => {
  const target = organization ?? app.name
  return (
    <AuthEmailLayout app={app} preview={`${inviter} invites you to join ${target}`} heading={`Join ${target}`}>
      <Text>
        {organization ? `${inviter} invites you to join ${organization} on ${app.name}.` : `${inviter} invites you to join ${app.name}.`} To accept, open this link:
      </Text>
      <EmailButton href={url}>Accept the invitation</EmailButton>
      <Text>The link works until {expiresAt.toUTCString()}.</Text>
      <EmailNote>If you do not want to join, ignore this email: nothing happens without you.</EmailNote>
    </AuthEmailLayout>
  )
}

/** The invitation email: who invites whom to which organization, or to the app, the link, and until when it works. */
export const invitationEmail = defineEmail({
  name: 'invitation',
  subject: ({ organization, app }: InvitationData) => (organization ? `Join ${organization} on ${app.name}` : `Join ${app.name}`),
  component: InvitationEmail,
})
