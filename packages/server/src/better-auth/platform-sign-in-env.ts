import type { PlatformSignIn } from './platform-sign-in'

// The parts of one provider's variables, after `PROTOBASE_SIGN_IN_` or `PROTOBASE_SIGN_IN_<ID>_`. No part ends in
// `_` and another part, so a variable splits into an id and a part one way only.
const parts = ['ISSUER', 'CLIENT_ID', 'CLIENT_SECRET', 'PROVIDER', 'NAME', 'TOKENS', 'AUTHORIZATION_PARAMS', 'HIDDEN', 'BUTTON', 'DEVICES'] as const
type Part = (typeof parts)[number]

// A provider id as it is written in a variable: `phone-app` is `PHONE_APP`. Ids have no `_`, so it reads back one way.
const idSegment = (id: string) => id.toUpperCase().replaceAll('-', '_')
const segmentId = (segment: string) => segment.toLowerCase().replaceAll('_', '-')

/** The variable of `part` for the provider `id`: the unnamed one has no id in its name, `phone` has `_PHONE_`. */
export const signInVariable = (part: Part, id?: string) => `PROTOBASE_SIGN_IN_${id === undefined ? '' : `${idSegment(id)}_`}${part}`

const keyed = new RegExp(`^PROTOBASE_SIGN_IN_(.+?)_(${parts.join('|')})$`)
// What a provider id looks like in a variable: the id pattern of `providerIdPattern`, upper case with `_` for `-`.
const segmentPattern = /^[A-Z][A-Z0-9_]*$/

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

// The provider `id` of the environment, or the unnamed one, or `undefined` when none of its issuer, client id and secret is set.
const readEntry = (env: Record<string, string | undefined>, id?: string): PlatformSignIn | undefined => {
  const name = (part: Part) => signInVariable(part, id)
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
  const provider = id ?? env[name('PROVIDER')]?.trim()
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
 * The providers the platform passes: the unnamed one first, then those named by their id, in order of their id. The
 * unnamed one is `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID` and `PROTOBASE_SIGN_IN_CLIENT_SECRET` (with
 * `PROTOBASE_SIGN_IN_PROVIDER`, `PROTOBASE_SIGN_IN_NAME` and `PROTOBASE_SIGN_IN_TOKENS`,
 * `PROTOBASE_SIGN_IN_AUTHORIZATION_PARAMS` as `name=value&other=value`, `PROTOBASE_SIGN_IN_HIDDEN`,
 * `PROTOBASE_SIGN_IN_BUTTON` and `PROTOBASE_SIGN_IN_DEVICES` optional); each named one is the same set with its id
 * after `PROTOBASE_SIGN_IN_`, upper case with `_` for `-`, such as `PROTOBASE_SIGN_IN_PHONE_ISSUER` for `phone`, and
 * takes no `_PROVIDER`. With `..._TOKENS=true` the issuer alone will do, or with the client id, for token sign-in
 * alone. Empty when none is set. A set short of all three otherwise, `..._TOKENS=true` without an issuer, `..._TOKENS`,
 * `..._HIDDEN`, `..._BUTTON` or `..._DEVICES` other than `true` or `false`, a named set without its issuer, an id that
 * is not one, or a named `_PROVIDER`, stops the server at startup.
 */
export const readPlatformSignIns = (env: Record<string, string | undefined>): PlatformSignIn[] => {
  const given = Object.keys(env).flatMap((variable) => {
    const [, segment, part] = (env[variable]?.trim() && keyed.exec(variable)) || []
    return segment && part ? [{ variable, segment, part }] : []
  })
  const odd = given.find(({ segment }) => !segmentPattern.test(segment))
  if (odd) throw new Error(`${odd.variable}: a platform sign-in provider's variables name it by its id, such as PROTOBASE_SIGN_IN_PHONE_ISSUER for the provider phone, not by a number`)
  const named = given.find(({ part }) => part === 'PROVIDER')
  if (named) throw new Error(`${named.variable}: the provider's id is already in the variable's name; leave it out`)
  const ids = [...new Set(given.map(({ segment }) => segmentId(segment)))].sort()
  const entries = ids.map((id) => {
    const entry = readEntry(env, id)
    if (!entry) throw new Error(`The platform sign-in provider ${id} needs ${signInVariable('ISSUER', id)}`)
    return entry
  })
  const first = readEntry(env)
  return first ? [first, ...entries] : entries
}
