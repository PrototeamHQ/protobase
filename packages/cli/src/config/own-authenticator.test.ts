import { describe, expect, it } from 'vitest'
import { overSignIn, type Authenticator, type AuthenticateSettings, type OverSignIn } from '@protobase/server'
import { projectAuthenticate } from './build-project'
import { mergeConfig } from './merge-config'
import type { ProjectFiles } from './project-files'

const issuer = 'http://localhost:1'
const signIn = { jwksUrl: `${issuer}/api/auth/jwks`, issuer }

// A config without sign-in whose auth/authenticate.ts exports `own`, verifying with `authenticate` settings
const configWith = (own: Authenticator | OverSignIn, authenticate?: AuthenticateSettings) => {
  const files: ProjectFiles = {
    resources: async () => ({}),
    functions: {},
    module: (file) => (file === 'auth/authenticate.ts' ? async () => ({ default: own }) : undefined),
    folder: () => [],
    package: (name) => Promise.reject(new Error(`no package ${name} in a test`)),
  }
  return mergeConfig({ config: { auth: false, ...(authenticate && { authenticate }) }, files, label: 'protobase.config.ts' })
}

describe("an authenticator of the app's own over its sign-in", () => {
  it('is made from the one its sign-in makes, and keeps the type of user ids it declares', async () => {
    let made: Authenticator | undefined
    const own = overSignIn((signInAuthenticator) => {
      made = signInAuthenticator
      return Object.assign((request: Request) => signInAuthenticator(request), { userIdType: 'uuid' as const })
    })
    const authenticate = await projectAuthenticate(configWith(own, signIn), undefined)
    expect(made).toBeTypeOf('function')
    expect(authenticate.userIdType).toBe('uuid')
    // It verifies as the sign-in's does: a request without a token is refused
    await expect(authenticate(new Request(`${issuer}/api/notes`))).rejects.toThrow()
  })

  it('still takes an authenticator of its own as it is', async () => {
    const own: Authenticator = async () => ({ user: { id: 1, roles: [] } })
    expect(await projectAuthenticate(configWith(own), undefined)).toBe(own)
  })
})
