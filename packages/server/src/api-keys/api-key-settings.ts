/**
 * The app's two keys, for clients that call it the way they call Supabase. `publishable_key` is safe in a browser and
 * makes a request anonymous or its signed-in user's; `secret_key` stays on servers and makes a request the app's own.
 * Each falls back to `PROTOBASE_PUBLISHABLE_KEY` and `PROTOBASE_SECRET_KEY`; without either, nothing is admitted by key.
 */
export type ApiKeysOptions = { publishable_key?: string; secret_key?: string }

export type ApiKeys = { publishable?: string; secret?: string }

export const apiKeyVariables = { publishable_key: 'PROTOBASE_PUBLISHABLE_KEY', secret_key: 'PROTOBASE_SECRET_KEY' } as const

// The other key's prefix in Supabase's formats: a key that has it was pasted in the wrong place.
const wrongPrefix = { publishable_key: 'sb_secret_', secret_key: 'sb_publishable_' } as const

/**
 * The keys that are set, unless the option is `false`. A publishable key that looks like a secret one, the other way
 * round, or both the same stop the server at startup, without printing the keys.
 */
export const apiKeySettings = (option: ApiKeysOptions | false | undefined, env: Record<string, string | undefined>): ApiKeys => {
  if (option === false) return {}
  const read = (name: keyof ApiKeysOptions) => {
    const value = (option?.[name] ?? env[apiKeyVariables[name]])?.trim()
    if (!value) return undefined
    const source = option?.[name] === undefined ? apiKeyVariables[name] : `The ${name} option`
    if (value.startsWith(wrongPrefix[name])) throw new Error(`${source} starts with ${wrongPrefix[name]}, the other key's prefix; swap the two keys`)
    return value
  }
  const publishable = read('publishable_key')
  const secret = read('secret_key')
  if (publishable !== undefined && publishable === secret) throw new Error('The publishable and the secret key are the same; the secret key must be one of its own')
  return { ...(publishable && { publishable }), ...(secret && { secret }) }
}
