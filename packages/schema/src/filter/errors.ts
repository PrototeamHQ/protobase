import type { FilterError, FilterErrorCode, Span } from '../model'

export const filterError = (
  code: FilterErrorCode,
  message: string,
  hint: string,
  span: Span,
): FilterError => ({ code, message, hint, span })

export const joinSpans = (a: Span, b: Span): Span => ({ start: a.start, end: b.end })

const distance = (a: string, b: string) => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + cost)
    }
    row = next
  }
  return row[b.length]!
}

export const suggest = (name: string, candidates: string[]) => {
  const lower = name.toLowerCase()
  const scored = candidates
    .map((candidate) => ({ candidate, score: distance(lower, candidate.toLowerCase()) }))
    .sort((a, b) => a.score - b.score)[0]
  return scored && scored.score <= Math.max(2, Math.floor(name.length / 3)) ? scored.candidate : undefined
}
