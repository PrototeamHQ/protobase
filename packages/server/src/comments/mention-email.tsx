import { Text } from 'react-email'
import { EmailButton, EmailLayout, EmailNote } from '../mail/email-layout'
import type { MailingApp } from '../mail/mailing-app'
import { defineEmail } from '../mail/define-email'

export type MentionData = { app: MailingApp; author: string; record: string; body: string; url: string }

// The comment keeps its line breaks in both parts: as <br> in the HTML one, which the plain-text one turns back into breaks.
const MentionEmail = ({ app, author, record, body, url }: MentionData) => (
  <EmailLayout app={app} preview={`${author} mentioned you on ${record}`} heading={`${author} mentioned you`}>
    <Text>
      {author} mentioned you in a comment on {record} in {app.name}:
    </Text>
    <Text style={{ whiteSpace: 'pre-wrap' }}>
      {body.split('\n').flatMap((line, index) => (index === 0 ? [line] : [<br key={index} />, line]))}
    </Text>
    <EmailButton href={url}>Open {record}</EmailButton>
    <EmailNote>You get this email because someone mentioned you. Reply in the app, not to this email.</EmailNote>
  </EmailLayout>
)

/** The email to someone a comment mentions: who wrote it on which record, the comment, and a link to the record. */
export const mentionEmail = defineEmail({ name: 'mention', subject: ({ author, record }: MentionData) => `${author} mentioned you on ${record}`, component: MentionEmail })
