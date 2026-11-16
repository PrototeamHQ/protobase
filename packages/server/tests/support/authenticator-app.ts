import { expect } from 'vitest'
import { authenticatorCode } from './vault-app'

type Request = (path: string, init: { body?: unknown; cookie?: string }) => Response | Promise<Response>

/** Turns on an authenticator app for the account `cookie` signed in, with its password; answers its link, for codes. */
export const turnOnAuthenticatorApp = async (request: Request, cookie: string, password: string) => {
  const { totpURI } = (await (await request('/two-factor/enable', { cookie, body: { password } })).json()) as { totpURI: string }
  expect((await request('/two-factor/verify-totp', { cookie, body: { code: authenticatorCode(totpURI) } })).status).toBe(200)
  return totpURI
}
