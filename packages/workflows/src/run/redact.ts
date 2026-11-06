const secretKey = /^pass$|pass(word|phrase|code|wd)|secret|token|authorization|api[-_]?key|cookie|credential|private[-_]?key|signature/i

/** A copy of a value with each field whose name says it holds a secret, such as `Authorization` or `apiKey`, replaced. */
export const redacted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redacted)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretKey.test(key) ? '[redacted]' : redacted(item)]))
}

/** Secret values shorter than this are refused, so blanking them never blanks ordinary text. */
export const shortestSecret = 8

/**
 * Replaces every secret value inside a text, and inside every text of a value, by `[redacted]`; `add` blanks one more
 * from then on, such as an access token a step was given, for as long as this redactor lives.
 */
export type Redactor = { text: (text: string) => string; value: <T>(value: T) => T; add: (secret: string) => void }

/**
 * The redactor of the app's secret values, wherever they appear inside a text, such as `Bearer <token>` or a token in
 * a URL's query; the longest first, so a secret inside another is blanked whole.
 */
export const secretRedactor = (secrets: readonly string[]): Redactor => {
  const short = secrets.find((secret) => secret.length < shortestSecret)
  if (short !== undefined) throw new Error(`A secret workflows read is shorter than ${shortestSecret} characters, too short to blank out of what runs record`)
  const ordered = [...new Set(secrets)].sort((a, b) => b.length - a.length)
  // A value too short to blank safely is one no provider issues as a token; it is left as it is.
  const add = (secret: string) => {
    if (secret.length < shortestSecret || ordered.includes(secret)) return
    ordered.push(secret)
    ordered.sort((a, b) => b.length - a.length)
  }
  const text = (input: string) => ordered.reduce((result, secret) => result.replaceAll(secret, '[redacted]'), input)
  const value = <T>(input: T): T => {
    if (ordered.length === 0) return input
    if (typeof input === 'string') return text(input) as T
    if (Array.isArray(input)) return input.map(value) as T
    if (typeof input !== 'object' || input === null || input instanceof Date) return input
    // Keys that held different secrets can blank out the same: each after the first keeps its value under a numbered key.
    const kept: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(input)) {
      const blanked = text(key)
      let name = blanked
      for (let count = 2; Object.hasOwn(kept, name); count++) name = `${blanked} (${count})`
      kept[name] = value(item)
    }
    return kept as T
  }
  return { text, value, add }
}
