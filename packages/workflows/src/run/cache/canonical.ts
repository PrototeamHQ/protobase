/**
 * The JSON text of a value with every object's keys in code-unit order, so two equal values always give the same text.
 * Strings, keys and structure are written as JSON writes them, so no value can pass for another's text.
 */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  const text = JSON.stringify(value)
  if (text === undefined) throw new TypeError(`A ${typeof value} has no JSON form`)
  return text
}
