import type { Mailer } from '../../mail/smtp-mailer'
import type { MailTemplate } from '../../mail/template/define-template'
import type * as authEmails from './auth-emails'
import { mailingApp } from '../../mail/mailing-app'

/** How auth emails go out: through `mailer`, naming the app `appName` and linking it on `baseURL` or the request's origin. */
export type AuthMail = { mailer: Mailer; appName: string; baseURL: string }

type AuthEmails = typeof authEmails
export type AuthEmailName = keyof AuthEmails
type TemplateData<Name extends AuthEmailName> = AuthEmails[Name] extends MailTemplate<infer Data> ? Data : never
/** An auth email's data, its `expiresAt` given as a `Date`, which the mail writes in its own language. */
export type AuthEmailData<Name extends AuthEmailName> = { [K in keyof TemplateData<Name>]: K extends 'expiresAt' ? Date : TemplateData<Name>[K] }

// A moment as the mail writes it, in UTC, which it names: "October 15, 2026 at 12:00 PM UTC", "15 oktober 2026 om 12:00 UTC"
const momentText = (date: Date, language: string) =>
  new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(date)

/**
 * Renders the auth email `name` for `data`, with the app it comes from on the origin of `requestURL` (see `mailingApp`),
 * and sends it to `to`. It comes in the app's `locale` when the app sets one, else in `locale`, the language of the
 * request that caused it (its `Accept-Language`), else in English. The templates, and React Email with them, are
 * imported on the first auth email sent, so starting the server loads neither.
 */
export const sendAuthEmail = async <Name extends AuthEmailName>(mail: AuthMail, name: Name, to: string, data: AuthEmailData<Name>, requestURL?: string, locale?: string) => {
  const [templates, { appOrReaderLanguage }]: [AuthEmails, typeof import('../../mail/template/define-template')] = await Promise.all([import('./auth-emails'), import('../../mail/template/define-template')])
  const template = templates[name] as unknown as MailTemplate<Record<string, unknown>>
  const language = appOrReaderLanguage(template.languages, locale)
  const written = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value instanceof Date ? momentText(value, language) : value]))
  await template.send(to, written, { locale: language, mailer: mail.mailer, app: mailingApp(mail, requestURL) })
}
