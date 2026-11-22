import { checkedUrl } from '../checked-url'

/** Where the app checks its people's From addresses, and the secret it signs those calls with. */
export type MailCheckSettings = { url: string; platformSecret: string }

export const mailCheckVariable = 'PROTOBASE_MAIL_CHECK_URL'

/**
 * The mail check service the platform names in `PROTOBASE_MAIL_CHECK_URL`, with `PROTOBASE_SECRET` to sign the calls;
 * without either, From addresses are not checked. A value that is no http(s) URL stops startup, naming the variable.
 */
export const readMailCheckSettings = (env: Record<string, string | undefined>): MailCheckSettings | undefined => {
  const url = env[mailCheckVariable]?.trim()
  if (!url) return
  if (!env.PROTOBASE_SECRET) throw new Error(`${mailCheckVariable} signs its calls with the app's secret: set PROTOBASE_SECRET too`)
  return { url: checkedUrl(url, mailCheckVariable), platformSecret: env.PROTOBASE_SECRET }
}
