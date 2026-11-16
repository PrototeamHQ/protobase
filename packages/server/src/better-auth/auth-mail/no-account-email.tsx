/** @jsxImportSource @protobase/layout */
import { Button, Text, Trans, translations } from '@protobase/layout'
import { signInPath } from '@protobase/schema'
import { defineTemplate } from '../../mail/template/define-template'

export type NoAccountData = Record<never, never>

const texts = translations({
  en: {
    subject: 'No {app} account uses this address',
    preview: 'No {app} account uses this address',
    heading: 'No account for this address',
    intro: 'Someone asked for a code to sign in to {app} with this address. No account uses it, so no code was sent.',
    hint: 'If you have an account, sign in again with the address you signed up with.',
    action: 'Sign in to {app}',
    note: 'If this was not you, ignore this email: nothing was changed.',
  },
  nl: {
    subject: 'Geen account bij {app} gebruikt dit adres',
    preview: 'Geen account bij {app} gebruikt dit adres',
    heading: 'Geen account voor dit adres',
    intro: 'Iemand vroeg om een code om met dit adres in te loggen bij {app}. Geen enkel account gebruikt dit adres, dus er is geen code verstuurd.',
    hint: 'Heb je een account? Log dan opnieuw in met het adres waarmee je je hebt aangemeld.',
    action: 'Inloggen bij {app}',
    note: 'Was jij dit niet? Negeer dan deze e-mail: er is niets veranderd.',
  },
})

/** The email to an address that asked for a sign-in code while no account uses it: no code, a hint to try another address. */
export const noAccountEmail = defineTemplate<NoAccountData>({
  name: 'no-account',
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
      <Button href={`${app.url}${signInPath().slice(1)}`}>
        <Trans i18nKey="action" values={{ app: app.name }} />
      </Button>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})
