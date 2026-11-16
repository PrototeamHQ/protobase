/** @jsxImportSource @protobase/layout */
import { Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../../mail/template/define-template'

export type SignUpCodeData = { code: string; minutes: number }

const texts = translations({
  en: {
    subject: '{code} is your code to create an account with {app}',
    preview: 'Your code to create an account with {app}',
    heading: 'Create your account',
    intro: 'Use this code to create your account with {app}:',
    lifetime: 'It works for {minutes, plural, one {# minute} other {# minutes}}, once.',
    note: 'If you did not try to create an account, ignore this email: nobody can create one for your address without the code.',
  },
  nl: {
    subject: '{code} is je code om een account aan te maken bij {app}',
    preview: 'Je code om een account aan te maken bij {app}',
    heading: 'Maak je account aan',
    intro: 'Gebruik deze code om je account bij {app} aan te maken:',
    lifetime: 'De code is {minutes, plural, one {# minuut} other {# minuten}} geldig en werkt één keer.',
    note: 'Wilde je geen account aanmaken? Negeer dan deze e-mail: zonder de code kan niemand een account voor jouw adres aanmaken.',
  },
})

/** The email with the code that makes an account for the address. */
export const signUpCodeEmail = defineTemplate<SignUpCodeData>({
  name: 'sign-up-code',
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
