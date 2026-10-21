import { authBasePath } from './auth-base-path'

// The JWT plugin's short-lived API token, the one `token` an answer may carry to the page.
const apiTokenPath = `${authBasePath}/token`

const withoutTokens = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutTokens)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key, field]) => !(key === 'token' && typeof field === 'string')).map(([key, field]) => [key, withoutTokens(field)]))
}

// A JSON engine quotes the text it fails on in its message, and that text may be the token itself.
const parsed = (text: string) => {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Better Auth answered malformed JSON')
    throw error
  }
}

/**
 * Better Auth's answer to the page without the session tokens in its JSON, such as `get-session`'s `session.token` or a
 * sign-in's `token`: the session is the httpOnly cookie's alone, so script on the page never holds a long-lived credential.
 */
export const withoutSessionTokens = async (request: Request, response: Response) => {
  if (new URL(request.url).pathname === apiTokenPath) return response
  if (response.body === null) return response
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) return response
  const text = await response.text()
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  const body = text ? JSON.stringify(withoutTokens(parsed(text))) : null
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}
