/**
 * Replaces each secret's value inside the texts of a value, its keys too, by `[secret:<NAME>]`, the longest value first,
 * and says which secrets it found: a cache key holds a secret's name, never its value. The secrets are at least
 * `shortestSecret` characters long, which the runner checks at startup.
 */
export const secretNamer = (secrets: Readonly<Record<string, string>>) => {
  const ordered = Object.entries(secrets).sort(([, a], [, b]) => b.length - a.length)
  return <T>(value: T) => {
    const found = new Set<string>()
    const text = (input: string) =>
      ordered.reduce((result, [name, secret]) => {
        if (!result.includes(secret)) return result
        found.add(name)
        return result.replaceAll(secret, `[secret:${name}]`)
      }, input)
    const walk = (input: unknown): unknown => {
      if (typeof input === 'string') return text(input)
      if (Array.isArray(input)) return input.map(walk)
      if (typeof input !== 'object' || input === null) return input
      return Object.fromEntries(Object.entries(input).map(([key, item]) => [text(key), walk(item)]))
    }
    const named = walk(value) as T
    return { value: named, secrets: [...found].sort() }
  }
}

export type SecretNamer = ReturnType<typeof secretNamer>
