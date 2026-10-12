import { checkedUrl } from '../checked-url'

/**
 * `dsn`: where the app's errors go, the DSN of a project in Sentry or a tracker that speaks its protocol (Bugsink,
 * GlitchTip, ...). Falls back to `PROTOBASE_SENTRY_DSN`. `environment` names the deployment in the tracker; the
 * tracker's own default (`production`) without it.
 */
export type ErrorReportingOptions = { dsn?: string; environment?: string }

/** Error reporting that is on: the server's and the admin app's errors go to `dsn`. */
export type ErrorReportingSettings = { dsn: string; environment?: string }

export const errorReportingVariable = 'PROTOBASE_SENTRY_DSN'

/**
 * The error reporting settings, when a DSN is set and the option is not `false`; off otherwise. A DSN that is no
 * http(s) URL with a public key and a project id stops the server at startup, without printing the DSN.
 */
export const errorReportingSettings = (option: ErrorReportingOptions | false | undefined, env: Record<string, string | undefined>): ErrorReportingSettings | undefined => {
  if (option === false) return undefined
  const dsn = (option?.dsn ?? env[errorReportingVariable])?.trim()
  if (!dsn) return undefined
  const source = option?.dsn === undefined ? errorReportingVariable : 'options.errorReporting.dsn'
  const url = new URL(checkedUrl(dsn, source))
  if (!url.username) throw new Error(`${source} has no public key; copy the DSN from the project's settings in the error tracker`)
  if (!/\/\d+$/.test(url.pathname)) throw new Error(`${source} does not end with a project id; copy the DSN from the project's settings in the error tracker`)
  const environment = option?.environment?.trim()
  return { dsn, ...(environment && { environment }) }
}
