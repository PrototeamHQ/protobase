const secretKey = /pass(word)?|secret|token|authorization|api[-_]?key|cookie|credential|private[-_]?key|signature/i

/** A copy of a value with each field whose name says it holds a secret, such as `Authorization` or `apiKey`, replaced. */
export const redacted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redacted)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretKey.test(key) ? '[redacted]' : redacted(item)]))
}
