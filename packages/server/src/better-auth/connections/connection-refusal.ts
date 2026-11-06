import { APIError } from 'better-auth/api'
import { headersLocale } from '../../locale/request-locale'
import { messages } from '../../locale/messages'

const text = messages('better-auth/connections')

type Code = Parameters<ReturnType<typeof text>>[0]

/** A connection endpoint's refusal by its code, in the language the request asks for. */
export const connectionRefusal = (status: ConstructorParameters<typeof APIError>[0], code: Code, headers: Headers | undefined) =>
  new APIError(status, { code, message: text(headersLocale(headers))(code) })
