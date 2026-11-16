/** @jsxImportSource @protobase/layout */
import { Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../../mail/template/define-template'

export type ChangeEmailCodeData = { code: string; minutes: number }

const texts = translations({
  en: {
    subject: '{code} confirms your new {app} address',
    preview: 'Your code to sign in to {app} with this address',
    heading: 'Confirm your new address',
    intro: 'Use this code to sign in to {app} with this address from now on:',
    lifetime: 'It works for {minutes, plural, one {# minute} other {# minutes}}, once.',
    note: 'If you did not ask for this, ignore this email: nobody can move an account to your address without the code.',
  },
  nl: {
    subject: '{code} bevestigt je nieuwe adres voor {app}',
    preview: 'Je code om voortaan met dit adres in te loggen bij {app}',
    heading: 'Bevestig je nieuwe adres',
    intro: 'Gebruik deze code om voortaan met dit adres in te loggen bij {app}:',
    lifetime: 'De code is {minutes, plural, one {# minuut} other {# minuten}} geldig en werkt één keer.',
    note: 'Heb je hier niet om gevraagd? Negeer dan deze e-mail: zonder de code kan niemand een account naar jouw adres verplaatsen.',
  },
})

/** The email to the new address with the code that moves the account to it. */
export const changeEmailCodeEmail = defineTemplate<ChangeEmailCodeData>({
  name: 'change-email-code',
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
