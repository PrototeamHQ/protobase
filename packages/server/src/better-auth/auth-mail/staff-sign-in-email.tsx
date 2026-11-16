/** @jsxImportSource @protobase/layout */
import { Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../../mail/template/define-template'

/** `expiresAt` is the date and time the session ends, as the mail writes it. */
export type StaffSignInData = { staff: string; reason: string; expiresAt: string }

const texts = translations({
  en: {
    subject: 'Staff signed in to {app} as you',
    preview: '{staff} signed in as you to help',
    heading: 'Staff signed in as you',
    intro: '{staff}, of the team that runs {app}, signed in as you to help. The reason they gave:',
    until: "Their session ends by {expiresAt}. The app's admins see it in the app's log of staff sign-ins.",
    note: 'If you did not expect this, tell your admin.',
  },
  nl: {
    subject: 'Een medewerker is als jou ingelogd bij {app}',
    preview: '{staff} is als jou ingelogd om je te helpen',
    heading: 'Een medewerker is als jou ingelogd',
    intro: '{staff}, van het team achter {app}, is als jou ingelogd om je te helpen. De reden die is opgegeven:',
    until: 'De sessie eindigt uiterlijk {expiresAt}. De beheerders van de app zien deze sessie in het logboek van inloggen door medewerkers.',
    note: 'Had je dit niet verwacht? Laat het je beheerder weten.',
  },
})

/** The email to someone whose app lets staff sign in as people only when they are told: who, why, and until when. */
export const staffSignInEmail = defineTemplate<StaffSignInData>({
  name: 'staff-sign-in',
  texts,
  subject: ({ app }) => <Trans i18nKey="subject" values={{ app: app.name }} />,
  preview: ({ data }) => <Trans i18nKey="preview" values={{ staff: data.staff }} />,
  body: ({ data, app }) => (
    <>
      <Text as="h1">
        <Trans i18nKey="heading" />
      </Text>
      <Text>
        <Trans i18nKey="intro" values={{ staff: data.staff, app: app.name }} />
      </Text>
      {/* As they wrote it: text, never markup. */}
      <Text>
        <Text as="em">{`${data.reason}`}</Text>
      </Text>
      <Text>
        <Trans i18nKey="until" values={{ expiresAt: data.expiresAt }} />
      </Text>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})
