const units = { s: 1, m: 60, h: 3600 }

export const maxTtlSeconds = 24 * 3600

// "30s", "15m" or "24h" -> seconds, at most 24 hours.
export const parseTtl = (text: string) => {
  const match = /^(\d+)([smh])$/.exec(text)
  if (!match) throw new Error(`Invalid --ttl "${text}", expected a number with s, m or h, for example 15m`)
  const seconds = Number(match[1]) * units[match[2] as keyof typeof units]
  if (seconds < 1 || seconds > maxTtlSeconds) throw new Error('--ttl must be between 1s and 24h')
  return seconds
}
