import { prefixPattern } from './token-format'

/**
 * `auth.personalAccessTokens`: people create long-lived tokens on their account page for their scripts. `prefix` starts
 * every token, so it can be told apart from other text, such as a scanner finding it in a commit: lowercase letters,
 * digits and underscores, ending in `_`, such as `invoices_`. It has no default: each app names its own.
 */
export type PersonalAccessTokensOptions = { prefix: string }

const example = "such as { prefix: 'invoices_' }"

/** The options as given, checked: a missing or invalid prefix stops the server at startup, naming the problem. */
export const resolvePersonalAccessTokens = (options: unknown): PersonalAccessTokensOptions => {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) throw new Error(`auth.personalAccessTokens takes an object with the tokens' prefix, ${example}`)
  const { prefix } = options as { prefix?: unknown }
  if (prefix === undefined) throw new Error(`auth.personalAccessTokens needs a prefix, ${example}: it starts every token, and has no default`)
  if (typeof prefix !== 'string' || !prefixPattern.test(prefix)) {
    throw new Error(`auth.personalAccessTokens.prefix ${JSON.stringify(prefix)} is not lowercase letters, digits and underscores ending in _, ${example}`)
  }
  const unknown = Object.keys(options).filter((key) => key !== 'prefix')
  if (unknown.length > 0) throw new Error(`auth.personalAccessTokens takes only a prefix, not ${unknown.join(', ')}`)
  return { prefix }
}
