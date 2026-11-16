/** @jsxImportSource @protobase/layout */
import { Button, Text, Trans, translations } from '@protobase/layout'
import { signInPath } from '@protobase/schema'
import { defineTemplate } from '../../mail/template/define-template'

export type PasswordChangedData = Record<never, never>

const texts = translations({
  en: {
    subject: 'Your {app} password was changed',
    preview: 'The password of your {app} account was changed',
    heading: 'Your password was changed',
    intro: 'The password of your account with {app} was just changed.',
    hint: 'If this was not you, choose a new password at once with "Forgot password?" on the sign-in page:',
    action: 'Choose a new password',
    note: 'If this was you, ignore this email.',
  },
  nl: {
    subject: 'Je wachtwoord voor {app} is gewijzigd',
    preview: 'Het wachtwoord van je account bij {app} is gewijzigd',
    heading: 'Je wachtwoord is gewijzigd',
    intro: 'Het wachtwoord van je account bij {app} is zojuist gewijzigd.',
    hint: 'Was jij dit niet? Kies dan meteen een nieuw wachtwoord met "Wachtwoord vergeten?" op de inlogpagina:',
    action: 'Kies een nieuw wachtwoord',
    note: 'Was jij dit wel? Dan kun je deze e-mail negeren.',
  },
})

/** The email to an account whose password changed: what happened, and how to take the account back if it was not them. */
export const passwordChangedEmail = defineTemplate<PasswordChangedData>({
  name: 'password-changed',
  texts,
  subject: ({ app }) => <Trans i18nKey="subject" values={{ app: app.name }} />,
  preview: ({ app }) => <Trans i18nKey="preview" values={{ app: app.name }} />,
  body: ({ app }) => (
    <>
      <Text as="h1">
        <Trans i18nKey="heading" />
      </Text>
      <Text>
        <Trans i18nKey="intro" values={{ app: app.name }} />
      </Text>
      <Text>
        <Trans i18nKey="hint" />
      </Text>
      {/* The app's url ends in a slash: it is its home page. */}
      <Button href={`${app.url}${signInPath({ step: 'forgot-password' })}`}>
        <Trans i18nKey="action" />
      </Button>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})
