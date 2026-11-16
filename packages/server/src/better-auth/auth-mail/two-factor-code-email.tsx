/** @jsxImportSource @protobase/layout */
import { Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../../mail/template/define-template'

export type TwoFactorCodeData = { code: string; minutes: number }

const texts = translations({
  en: {
    subject: '{code} is your {app} verification code',
    preview: 'Your code to finish signing in to {app}',
    heading: 'Finish signing in',
    intro: 'Use this code to finish signing in to {app}:',
    lifetime: 'It works for {minutes, plural, one {# minute} other {# minutes}}, once.',
    note: 'If you did not just sign in, someone else may know your password or have your sign-in code: change your password.',
  },
  nl: {
    subject: '{code} is je verificatiecode voor {app}',
    preview: 'Je code om het inloggen bij {app} af te ronden',
    heading: 'Rond het inloggen af',
    intro: 'Gebruik deze code om het inloggen bij {app} af te ronden:',
    lifetime: 'De code is {minutes, plural, one {# minuut} other {# minuten}} geldig en werkt één keer.',
    note: 'Heb je niet net ingelogd? Dan kent iemand anders misschien je wachtwoord of heeft die je inlogcode: wijzig je wachtwoord.',
  },
})

/** The email with the second step of a sign-in, for an account with two-factor authentication by email. */
export const twoFactorCodeEmail = defineTemplate<TwoFactorCodeData>({
  name: 'two-factor-code',
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
