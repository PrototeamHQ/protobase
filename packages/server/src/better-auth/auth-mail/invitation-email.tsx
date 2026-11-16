/** @jsxImportSource @protobase/layout */
import { Button, Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../../mail/template/define-template'

/** `expiresAt` is the date and time the link stops working, as the mail writes it. */
export type InvitationData = { inviter: string; organization: string; url: string; expiresAt: string }
export type AppInvitationData = { inviter: string; url: string; expiresAt: string }

const texts = translations({
  en: {
    subject: 'Join {organization} on {app}',
    preview: '{inviter} invites you to join {organization}',
    heading: 'Join {organization}',
    intro: '{inviter} invites you to join {organization} on {app}. To accept, open this link:',
    app: {
      subject: 'Join {app}',
      preview: '{inviter} invites you to join {app}',
      heading: 'Join {app}',
      intro: '{inviter} invites you to join {app}. To accept, open this link:',
    },
    action: 'Accept the invitation',
    until: 'The link works until {expiresAt}.',
    note: 'If you do not want to join, ignore this email: nothing happens without you.',
  },
  nl: {
    subject: 'Word lid van {organization} op {app}',
    preview: '{inviter} nodigt je uit om lid te worden van {organization}',
    heading: 'Word lid van {organization}',
    intro: '{inviter} nodigt je uit om lid te worden van {organization} op {app}. Open deze link om de uitnodiging te accepteren:',
    app: {
      subject: 'Word lid van {app}',
      preview: '{inviter} nodigt je uit voor {app}',
      heading: 'Word lid van {app}',
      intro: '{inviter} nodigt je uit voor {app}. Open deze link om de uitnodiging te accepteren:',
    },
    action: 'Uitnodiging accepteren',
    until: 'De link werkt tot {expiresAt}.',
    note: 'Wil je geen lid worden? Negeer dan deze e-mail: zonder jou gebeurt er niets.',
  },
})

/** The invitation to an organization: who invites whom to which one, the link, and until when it works. */
export const invitationEmail = defineTemplate<InvitationData>({
  name: 'invitation',
  texts,
  subject: ({ data, app }) => <Trans i18nKey="subject" values={{ organization: data.organization, app: app.name }} />,
  preview: ({ data }) => <Trans i18nKey="preview" values={{ inviter: data.inviter, organization: data.organization }} />,
  body: ({ data, app }) => (
    <>
      <Text as="h1">
        <Trans i18nKey="heading" values={{ organization: data.organization }} />
      </Text>
      <Text>
        <Trans i18nKey="intro" values={{ inviter: data.inviter, organization: data.organization, app: app.name }} />
      </Text>
      <Button href={`${data.url}`}>
        <Trans i18nKey="action" />
      </Button>
      <Text>
        <Trans i18nKey="until" values={{ expiresAt: data.expiresAt }} />
      </Text>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})

/** The invitation to the app itself, without an organization: who invites, the link, and until when it works. */
export const appInvitationEmail = defineTemplate<AppInvitationData>({
  name: 'app-invitation',
  texts,
  subject: ({ app }) => <Trans i18nKey="app.subject" values={{ app: app.name }} />,
  preview: ({ data, app }) => <Trans i18nKey="app.preview" values={{ inviter: data.inviter, app: app.name }} />,
  body: ({ data, app }) => (
    <>
      <Text as="h1">
        <Trans i18nKey="app.heading" values={{ app: app.name }} />
      </Text>
      <Text>
        <Trans i18nKey="app.intro" values={{ inviter: data.inviter, app: app.name }} />
      </Text>
      <Button href={`${data.url}`}>
        <Trans i18nKey="action" />
      </Button>
      <Text>
        <Trans i18nKey="until" values={{ expiresAt: data.expiresAt }} />
      </Text>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})
