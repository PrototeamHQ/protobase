/** @jsxImportSource @protobase/layout */
import { Button, Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../../mail/template/define-template'

export type ResetPasswordData = { url: string; hours: number }

const texts = translations({
  en: {
    subject: 'Reset your {app} password',
    preview: 'Choose a new password for {app}',
    heading: 'Reset your password',
    intro: 'Someone asked to reset the password of your account with {app}. To choose a new password, open this link:',
    action: 'Choose a new password',
    lifetime: 'The link works for {hours, plural, one {# hour} other {# hours}}, once.',
    note: 'If you did not ask for this, ignore this email: your password stays as it is.',
  },
  nl: {
    subject: 'Stel je wachtwoord voor {app} opnieuw in',
    preview: 'Kies een nieuw wachtwoord voor {app}',
    heading: 'Stel je wachtwoord opnieuw in',
    intro: 'Iemand vroeg om het wachtwoord van je account bij {app} opnieuw in te stellen. Open deze link om een nieuw wachtwoord te kiezen:',
    action: 'Kies een nieuw wachtwoord',
    lifetime: 'De link is {hours} uur geldig en werkt één keer.',
    note: 'Heb je hier niet om gevraagd? Negeer dan deze e-mail: je wachtwoord blijft zoals het is.',
  },
})

/** The reset email: the link, how long it works, and that it can be ignored. */
export const resetPasswordEmail = defineTemplate<ResetPasswordData>({
  name: 'reset-password',
  texts,
  subject: ({ app }) => <Trans i18nKey="subject" values={{ app: app.name }} />,
  preview: ({ app }) => <Trans i18nKey="preview" values={{ app: app.name }} />,
  body: ({ data, app }) => (
    <>
      <Text as="h1">
        <Trans i18nKey="heading" />
      </Text>
      <Text>
        <Trans i18nKey="intro" values={{ app: app.name }} />
      </Text>
      <Button href={`${data.url}`}>
        <Trans i18nKey="action" />
      </Button>
      <Text>
        <Trans i18nKey="lifetime" values={{ hours: data.hours }} />
      </Text>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})
