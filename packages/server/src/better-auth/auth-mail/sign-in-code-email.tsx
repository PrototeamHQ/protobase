/** @jsxImportSource @protobase/layout */
import { Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../../mail/template/define-template'

export type SignInCodeData = { code: string; minutes: number }

const texts = translations({
  en: {
    subject: '{code} is your {app} sign-in code',
    preview: 'Your code to sign in to {app}',
    heading: 'Your sign-in code',
    intro: 'Use this code to sign in to {app}:',
    lifetime: 'It works for {minutes, plural, one {# minute} other {# minutes}}, once.',
    note: 'If you did not try to sign in, ignore this email: nobody can sign in without the code.',
  },
  nl: {
    subject: '{code} is je inlogcode voor {app}',
    preview: 'Je code om in te loggen bij {app}',
    heading: 'Je inlogcode',
    intro: 'Gebruik deze code om in te loggen bij {app}:',
    lifetime: 'De code is {minutes, plural, one {# minuut} other {# minuten}} geldig en werkt één keer.',
    note: 'Heb je niet geprobeerd in te loggen? Negeer dan deze e-mail: zonder de code kan niemand inloggen.',
  },
})

/** The email with a code to sign in with instead of a password. */
export const signInCodeEmail = defineTemplate<SignInCodeData>({
  name: 'sign-in-code',
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
