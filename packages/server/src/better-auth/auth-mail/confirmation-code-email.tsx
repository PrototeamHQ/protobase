/** @jsxImportSource @protobase/layout */
import { Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../../mail/template/define-template'

export type ConfirmationCodeData = { code: string; minutes: number }

const texts = translations({
  en: {
    subject: "{code} confirms it's you in {app}",
    preview: "Your code to confirm it's you in {app}",
    heading: "Confirm it's you",
    intro: "You are signed in to {app} and asked to confirm it's you. Use this code there:",
    lifetime: 'It works for {minutes, plural, one {# minute} other {# minutes}}, once, and only where you asked for it. It does not sign you in.',
    note: 'If you did not ask for it, someone may be signed in to your account: sign out of your other devices on your account page.',
  },
  nl: {
    subject: '{code} bevestigt dat jij het bent in {app}',
    preview: 'Je code om te bevestigen dat jij het bent in {app}',
    heading: 'Bevestig dat jij het bent',
    intro: 'Je bent ingelogd bij {app} en hebt gevraagd te bevestigen dat jij het bent. Gebruik daar deze code:',
    lifetime: 'De code is {minutes, plural, one {# minuut} other {# minuten}} geldig, werkt één keer en alleen waar je hem hebt aangevraagd. Je logt er niet mee in.',
    note: 'Heb je er niet om gevraagd? Dan is misschien iemand anders ingelogd op je account: log op je accountpagina uit op je andere apparaten.',
  },
})

/** The email with a code that confirms it's them inside a signed-in session, for an account without a passkey or a second step. */
export const confirmationCodeEmail = defineTemplate<ConfirmationCodeData>({
  name: 'confirmation-code',
  texts,
  subject: ({ data, app }) => <Trans i18nKey="subject" values={{ code: data.code, app: app.name }} />,
  preview: ({ app }) => <Trans i18nKey="preview" values={{ app: app.name }} />,
  body: ({ data, app }) => (
    <>
      <Text as="h1">
        <Trans i18nKey="heading" />
      </Text>
      <Text>
        <Trans i18nKey="intro" values={{ app: app.name }} />
      </Text>
      <Text as="h2">{`${data.code}`}</Text>
      <Text>
        <Trans i18nKey="lifetime" values={{ minutes: data.minutes }} />
      </Text>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})
