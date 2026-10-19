import { Text } from 'react-email'
import { defineEmail } from '../../mail/define-email'
import { EmailLayout, EmailNote } from '../../mail/email-layout'
import type { MailingApp } from '../../mail/mailing-app'

export type StaffSignInData = { app: MailingApp; staff: string; reason: string; expiresAt: Date }

const StaffSignInEmail = ({ app, staff, reason, expiresAt }: StaffSignInData) => (
  <EmailLayout app={app} preview={`${staff} signed in as you to help`} heading="Staff signed in as you">
    <Text>
      {staff}, of the team that runs {app.name}, signed in as you to help. The reason they gave:
    </Text>
    <Text style={{ borderLeft: '3px solid #e4e4e7', paddingLeft: '12px' }}>{reason}</Text>
    <Text>Their session ends by {expiresAt.toUTCString()}. The app's admins see it in the app's log of staff sign-ins.</Text>
    <EmailNote>If you did not expect this, tell your admin.</EmailNote>
  </EmailLayout>
)

/** The email to someone whose app lets staff sign in as people only when they are told: who, why, and until when. */
export const staffSignInEmail = defineEmail({ name: 'staff-sign-in', subject: ({ app }: StaffSignInData) => `Staff signed in to ${app.name} as you`, component: StaffSignInEmail })
