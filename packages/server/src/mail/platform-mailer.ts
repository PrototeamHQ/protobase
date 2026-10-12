import { readMailSettings } from './mail-settings'
import { smtpMailer } from './smtp-mailer'

/** The platform's SMTP server and sender from `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM`; `undefined` when mail is off. */
export const platformMailer = (env: Record<string, string | undefined> = globalThis.process?.env ?? {}) => {
  const settings = readMailSettings(env)
  return settings && smtpMailer(settings)
}
