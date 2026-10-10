const units: Record<string, number> = {
  s: 1_000, second: 1_000,
  m: 60_000, min: 60_000, minute: 60_000,
  h: 3_600_000, hour: 3_600_000,
  d: 86_400_000, day: 86_400_000,
  w: 604_800_000, week: 604_800_000,
}

/** Milliseconds from a number of them or text such as `1 day`, `14d`, `12 hours` or `0`. */
export const parseDuration = (value: number | string, label: string): number => {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a whole number of milliseconds, not ${value}`)
    return value
  }
  const invalid = new Error(`${label} is "${value}"; write it like "1 day", "14d" or "12 hours"`)
  const match = /^\s*(\d+)\s*([a-z]*)\s*$/i.exec(value)
  if (!match) throw invalid
  const amount = Number(match[1])
  const word = match[2]!.toLowerCase()
  if (word === '') {
    if (amount === 0) return 0
    throw invalid
  }
  const unit = units[word] ?? units[word.replace(/s$/, '')]
  if (unit === undefined) throw invalid
  return amount * unit
}
