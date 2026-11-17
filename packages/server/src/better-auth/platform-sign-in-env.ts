import type { PlatformSignIn } from './platform-sign-in'

// The parts of one provider's variables, after `PROTOBASE_SIGN_IN_` or `PROTOBASE_SIGN_IN_<n>_`.
const parts = ['ISSUER', 'CLIENT_ID', 'CLIENT_SECRET', 'PROVIDER', 'NAME', 'TOKENS', 'AUTHORIZATION_PARAMS', 'HIDDEN', 'BUTTON', 'DEVICES'] as const
type Part = (typeof parts)[number]

/** The variable of `part` for the provider `number`: the first has none in its name, the second `_2_`, and so on. */
export const signInVariable = (part: Part, number = 1) => `PROTOBASE_SIGN_IN_${number === 1 ? '' : `${number}_`}${part}`

const numbered = new RegExp(`^PROTOBASE_SIGN_IN_(\\d+)_(${parts.join('|')})$`)

// A boolean variable is true or false; unset or empty, it is not given.
const readBoolean = (env: Record<string, string | undefined>, name: string) => {
  const value = env[name]?.trim()
  if (!value) return
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false, not "${value}"`)
  return value === 'true'
}

// Parameters written as a query string, `name=value&other=value`; unset or empty, none are given. A name twice is an error.
const readParams = (env: Record<string, string | undefined>, name: string) => {
  const value = env[name]?.trim()
  if (!value) return
  const params = [...new URLSearchParams(value)]
  const twice = params.find(([key], index) => params.findIndex(([other]) => other === key) !== index)
  if (twice) throw new Error(`${name} names ${twice[0]} twice`)
  if (params.some(([key]) => !key)) throw new Error(`${name} must be written as name=value&other=value, not "${value}"`)
  return Object.fromEntries(params)
}

// The provider `number` of the environment, or `undefined` when none of its issuer, client id and secret is set.
const readEntry = (env: Record<string, string | undefined>, number: number): PlatformSignIn | undefined => {
  const name = (part: Part) => signInVariable(part, number)
  const required = [name('ISSUER'), name('CLIENT_ID'), name('CLIENT_SECRET')]
  const [issuer, clientId, clientSecret] = required.map((variable) => env[variable]?.trim() || undefined)
  const tokenSignIn = readBoolean(env, name('TOKENS'))
  if (!issuer && !clientId && !clientSecret) {
    if (tokenSignIn) throw new Error(`${name('TOKENS')} needs the platform sign-in provider: set ${required.join(', ')} too, or leave it out`)
    return undefined
  }
  if (!issuer || (clientSecret && !clientId) || (!clientSecret && tokenSignIn !== true)) {
    throw new Error(`${required.join(', ')} go together: set all three for the platform sign-in provider, or none; or ${name('ISSUER')} with ${name('TOKENS')}=true for token sign-in alone`)
  }
  const provider = env[name('PROVIDER')]?.trim()
  const display = env[name('NAME')]?.trim()
  const authorizationParams = readParams(env, name('AUTHORIZATION_PARAMS'))
  const hidden = readBoolean(env, name('HIDDEN'))
  const button = readBoolean(env, name('BUTTON'))
  const devices = readBoolean(env, name('DEVICES'))
  return {
    issuer,
    ...(clientId && { clientId }),
    ...(clientSecret && { clientSecret }),
    ...(provider && { provider }),
    ...(display && { name: display }),
    ...(tokenSignIn !== undefined && { tokenSignIn }),
    ...(authorizationParams && { authorizationParams }),
    ...(hidden !== undefined && { hidden }),
    ...(button !== undefined && { button }),
    ...(devices !== undefined && { devices }),
  }
}

/**
 * The providers the platform passes, in order. The first is `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID`
 * and `PROTOBASE_SIGN_IN_CLIENT_SECRET` (with `PROTOBASE_SIGN_IN_PROVIDER`, `PROTOBASE_SIGN_IN_NAME` and
 * `PROTOBASE_SIGN_IN_TOKENS`, `PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS` as `name=value&other=value`,
 * `PROTOBASE_SIGN_IN_HIDDEN`, `PROTOBASE_SIGN_IN_BUTTON` and `PROTOBASE_SIGN_IN_DEVICES` optional); each further one is the same set with its number after `PROTOBASE_SIGN_IN_`,
 * from 2 up, such as `PROTOBASE_SIGN_IN_2_ISSUER`. With `..._TOKENS=true` the issuer alone will do, or with the client
 * id, for token sign-in alone. Empty when none is set. A set short of all three otherwise, `..._TOKENS=true` without an
 * issuer, `..._TOKENS`, `..._HIDDEN`, `..._BUTTON` or `..._DEVICES` other than `true` or `false`, or a number without every number before it, stops the server at
 * startup.
 */
export const readPlatformSignIns = (env: Record<string, string | undefined>): PlatformSignIn[] => {
  const given = Object.keys(env).flatMap((variable) => {
    const number = env[variable]?.trim() ? numbered.exec(variable)?.[1] : undefined
    return number === undefined ? [] : [{ variable, number }]
  })
  const odd = given.find(({ number }) => String(Number(number)) !== number || Number(number) < 2)
  if (odd) throw new Error(`${odd.variable}: the first platform sign-in provider's variables have no number, the second's start at PROTOBASE_SIGN_IN_2_`)
  const last = Math.max(1, ...given.map(({ number }) => Number(number)))
  const entries = Array.from({ length: last }, (_, index) => readEntry(env, index + 1))
  const missing = entries.findIndex((entry) => entry === undefined)
  if (last > 1 && missing !== -1) {
    throw new Error(`The platform sign-in providers are numbered without gaps, up to ${signInVariable('ISSUER', last)}: set ${signInVariable('ISSUER', missing + 1)} too`)
  }
  return entries.filter((entry) => entry !== undefined)
}
