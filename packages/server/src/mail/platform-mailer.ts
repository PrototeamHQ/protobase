import { readAppName } from '../app-name'
import { readMailSettings } from './mail-settings'
import { smtpMailer } from './smtp-mailer'

/**
 * The platform's SMTP server and sender from `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM`; `undefined` when mail is off.
 * The From header shows `name` as the sender's name, by default the app's name from `PROTOBASE_APP_NAME`, when set.
 */
export const platformMailer = (env: Record<string, string | undefined> = globalThis.process?.env ?? {}, name = readAppName(env)) => {
  const settings = readMailSettings(env)
  return settings && smtpMailer({ ...settings, ...(name && { name }) })
}
