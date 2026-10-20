import { isDatabaseError } from '../error-handler'

/** An error body as PostgREST sends it, which supabase-js hands to the app as `error`. */
export type RestErrorBody = { code: string; details: string | null; hint: string | null; message: string }

/** A `/rest/v1` error: its status, the body, and headers such as `Content-Range`. Thrown anywhere below the route. */
export class RestError extends Error {
  constructor(
    readonly status: number,
    readonly body: RestErrorBody,
    readonly headers: Record<string, string> = {},
  ) {
    super(body.message)
  }

  withHeaders(headers: Record<string, string>) {
    return new RestError(this.status, this.body, { ...this.headers, ...headers })
  }
}

export const restError = (status: number, code: string, message: string, details: string | null = null, hint: string | null = null) =>
  new RestError(status, { code, details, hint, message })

/** PGRST100: a query parameter that does not parse. */
export const parseError = (message: string, details: string | null = null) => restError(400, 'PGRST100', message, details)

// The status PostgREST gives a database error, by its SQLSTATE (PostgREST's `pgErrorStatus`).
const prefixStatus: [string, number][] = [
  ['08', 503], ['09', 500], ['0L', 403], ['0P', 403], ['25', 500], ['28', 403], ['2D', 500], ['38', 500], ['39', 500],
  ['3B', 500], ['40', 500], ['53', 503], ['54', 500], ['55', 500], ['57', 500], ['58', 500], ['F0', 500], ['HV', 500],
  ['P0', 500], ['XX', 500],
]
const codeStatus: Record<string, number> = {
  '23503': 409, '23505': 409, '25006': 405, '53400': 500, '57P01': 503, P0001: 400, '42883': 404, '42P01': 404, '42P17': 500,
}

const databaseStatus = (code: string, message: string, anonymous: boolean) => {
  if (code === '42501') return anonymous ? 401 : 403
  // A function's `raise sqlstate 'PT402'` picks the status itself.
  if (code.startsWith('PT')) return Number(code.slice(2)) || 500
  if (code === '21000') return message.endsWith('requires a WHERE clause') ? 400 : 500
  return codeStatus[code] ?? prefixStatus.find(([prefix]) => code.startsWith(prefix))?.[1] ?? 400
}

/**
 * The `/rest/v1` error an error stands for: its own, or a database error with PostgREST's status and the error's
 * message, detail and hint, which PostgREST passes on as they are. Other errors give `undefined`. Refusing a write by
 * RLS is 401 for an anonymous caller and 403 for others, as on Supabase.
 */
export const restErrorOf = (error: unknown, anonymous: boolean): RestError | undefined => {
  if (error instanceof RestError) return error
  if (!isDatabaseError(error)) return undefined
  const { code, message, detail, hint } = error as unknown as { code: string; message: string; detail?: string; hint?: string }
  return restError(databaseStatus(code, message, anonymous), code, message, detail ?? null, hint ?? null)
}
