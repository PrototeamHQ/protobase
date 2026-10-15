import type { EmailTemplate } from '../../mail/define-email'
import type { Mailer } from '../../mail/smtp-mailer'
import type * as authEmails from './auth-emails'
import { mailingApp } from './mailing-app'

/** How auth emails go out: through `mailer`, naming the app `appName` and linking it on `baseURL` or the request's origin. */
export type AuthMail = { mailer: Mailer; appName: string; baseURL: string }

type AuthEmails = typeof authEmails
export type AuthEmailName = keyof AuthEmails
export type AuthEmailData<Name extends AuthEmailName> = AuthEmails[Name] extends EmailTemplate<infer Data> ? Data : never

/**
 * Renders the auth email `name` for `data`, with the app it comes from on the origin of `requestURL` (see `mailingApp`),
 * and sends it to `to`. The templates, and React Email with them, are imported on the first auth email sent, so
 * starting the server loads neither.
 */
export const sendAuthEmail = async <Name extends AuthEmailName>(mail: AuthMail, name: Name, to: string, data: Omit<AuthEmailData<Name>, 'app'>, requestURL?: string) => {
  const templates: AuthEmails = await import('./auth-emails')
  const template = templates[name] as EmailTemplate<AuthEmailData<Name>>
  await template.send(to, { ...data, app: mailingApp(mail, requestURL) } as AuthEmailData<Name>, mail.mailer)
}
