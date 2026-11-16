/** @jsxImportSource @protobase/layout */
import { Button, Text, Trans, translations } from '@protobase/layout'
import { signInPath } from '@protobase/schema'
import { defineTemplate } from '../../mail/template/define-template'

export type AccountExistsData = Record<never, never>

const texts = translations({
  en: {
    subject: 'You already have an account with {app}',
    preview: 'Sign in to {app} with this address instead',
    heading: 'You already have an account',
    intro: 'Someone asked to create an account with {app} for this address. It has one already, so no new account was made.',
    action: 'Sign in to {app}',
    note: 'If this was not you, ignore this email: your account stays as it is.',
  },
  nl: {
    subject: 'Je hebt al een account bij {app}',
    preview: 'Log in plaats daarvan met dit adres in bij {app}',
    heading: 'Je hebt al een account',
    intro: 'Iemand vroeg om met dit adres een account aan te maken bij {app}. Dit adres heeft al een account, dus er is geen nieuw account gemaakt.',
    action: 'Inloggen bij {app}',
    note: 'Was jij dit niet? Negeer dan deze e-mail: je account blijft zoals het is.',
  },
})

/** The email to an address that asked for a sign-up code while it has an account already: no code, a link to sign in instead. */
export const accountExistsEmail = defineTemplate<AccountExistsData>({
  name: 'account-exists',
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
      {/* The app's url ends in a slash: it is its home page. */}
      <Button href={`${app.url}${signInPath()}`}>
        <Trans i18nKey="action" values={{ app: app.name }} />
      </Button>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})
