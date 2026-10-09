export type MailSettings = {
  /** `smtp://user:password@host:587` (STARTTLS when offered) or `smtps://user:password@host:465` (TLS from the start). */
  smtpUrl: string
  /** The sender address, for example `noreply@admin.example.com`. */
  from: string
}

export const smtpUrlVariable = 'PROTOBASE_SMTP_URL'
export const mailFromVariable = 'PROTOBASE_MAIL_FROM'

const address = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

/**
 * The SMTP server and sender the platform passes in `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM`; `undefined` when
 * neither is set, which turns mail (and so password reset) off. One without the other, or a value that cannot be used,
 * is a configuration error, so the server stops at startup instead of failing on the first reset request.
 */
export const readMailSettings = (env: Record<string, string | undefined>): MailSettings | undefined => {
  const smtpUrl = env[smtpUrlVariable] || undefined
  const from = env[mailFromVariable]?.trim() || undefined
  if (!smtpUrl && !from) return undefined
  if (!smtpUrl || !from) throw new Error(`${smtpUrlVariable} and ${mailFromVariable} go together: set both to send mail, or neither`)
  if (!URL.canParse(smtpUrl)) throw new Error(`${smtpUrlVariable} is not a URL; use smtp://user:password@host:587 or smtps://...:465`)
  const url = new URL(smtpUrl)
  if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:') throw new Error(`${smtpUrlVariable} must start with smtp:// or smtps://, not ${url.protocol}//`)
  if (!url.hostname) throw new Error(`${smtpUrlVariable} has no host`)
  if (!address.test(from)) throw new Error(`${mailFromVariable} must be a plain email address, like noreply@example.com`)
  return { smtpUrl, from }
}
