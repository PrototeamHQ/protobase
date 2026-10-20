import { inject } from 'vitest'
import { testClock } from './clock'

// Times the Postgres clock made (now(), clock_timestamp(), a default) differ on every recording. A recording keeps
// them as tokens, numbered in the order they first came back, and the test sees each as a fixed time instead: the
// fake time `fakeServerTime(n)`, a day before the tests' clock, n milliseconds apart. A param the test sends with one
// of those fake times goes to Postgres as the real time it stands for, so the database still finds it. A time Postgres
// returns counts as its clock's when it falls in the recording run, so the templates must hold no such time. Each text
// form of a time (separator and zone) is numbered on its own: a time cut to milliseconds, such as to_char's `…Z`, would
// otherwise share a token with the full time it was cut from whenever that has no microseconds, once in a thousand runs.

declare module 'vitest' {
  export interface ProvidedContext {
    /** When this `bun run test:record` run started, by the real clock, in milliseconds. */
    snapshotRecordStart?: number
  }
}

const fakeBase = testClock.getTime() - 86_400_000

const timestamp = /(\d{4})-(\d{2})-(\d{2})([ T])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::\d{2})?)?/g
const token = /\{\{now:(\d+):([ T]):(-|\d):([^}]*)\}\}/g

type Parts = { sep: string; digits: string; zone: string; utc: boolean; micros: number }

const parse = (match: RegExpExecArray): Parts => {
  const [, y, mo, d, sep, h, mi, s, fraction = '', zone = ''] = match
  const [, sign = '+', zh = '0', zm = '0'] = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone) ?? []
  const offset = (sign === '-' ? -1 : 1) * (Number(zh) * 60 + Number(zm ?? 0)) * 60_000_000
  const micros = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!) * 1000 + Number(fraction.padEnd(6, '0') || 0) - offset
  return { sep: sep!, digits: fraction.length ? String(fraction.length) : '-', zone, utc: offset === 0, micros }
}

const format = (micros: number, { sep, digits, zone }: Pick<Parts, 'sep' | 'digits' | 'zone'>) => {
  const iso = new Date(Math.floor(micros / 1000)).toISOString()
  const fraction = String(micros % 1_000_000).padStart(6, '0')
  const shown = digits === '-' ? fraction.replace(/0+$/, '') : fraction.slice(0, Number(digits))
  return `${iso.slice(0, 10)}${sep}${iso.slice(11, 19)}${shown ? `.${shown}` : ''}${zone}`
}

export const fakeServerTime = (n: number) => (fakeBase + n) * 1000

/** Replaces each token in `text` with the fake time it stands for. */
export const decodeTimes = (text: string) =>
  text.replace(token, (_, n: string, sep: string, digits: string, zone: string) => format(fakeServerTime(Number(n)), { sep, digits, zone }))

/** The Postgres clock's times of one recording, real on the way in and tokens in the file. */
export const createServerTimes = () => {
  const numbers = new Map<string, number>()
  const reals = new Map<number, { micros: number; n: number }>()
  const key = (micros: number, { sep, zone }: Pick<Parts, 'sep' | 'zone'>) => `${micros}${sep}${zone}`
  // By the real clock, as the tests' Date is fake: from a minute before the run, for a server clock that is a little off,
  // to 30 days after now, for what Postgres sets ahead, such as a job's keep_until. The tests' clock and what they
  // count from it stay before the run.
  const start = (inject('snapshotRecordStart') ?? Infinity) - 60_000
  const isServerTime = (micros: number) => micros > start * 1000 && micros < (performance.timeOrigin + performance.now() + 30 * 86_400_000) * 1000

  /** Postgres's text with its clock's times as tokens; new times are numbered in time order. */
  const encodeResult = (texts: string[]) => {
    const fresh = new Map<string, Parts>()
    for (const text of texts) for (const match of text.matchAll(timestamp)) {
      const parts = parse(match)
      if (!isServerTime(parts.micros) || numbers.has(key(parts.micros, parts))) continue
      if (!parts.utc) throw new Error(`Postgres returned a time in zone ${parts.zone}; the snapshot tests need its TimeZone to be UTC`)
      fresh.set(key(parts.micros, parts), parts)
    }
    for (const [k, { micros }] of [...fresh].sort(([, a], [, b]) => a.micros - b.micros)) {
      const n = numbers.size + 1
      numbers.set(k, n)
      reals.set(fakeServerTime(n), { micros, n })
    }
    return (text: string) => text.replace(timestamp, (...match) => {
      const parts = parse(match as unknown as RegExpExecArray)
      const n = numbers.get(key(parts.micros, parts))
      // Postgres leaves trailing zeros off the fraction, so the token keeps no digit count.
      return n === undefined || !isServerTime(parts.micros) ? match[0] : `{{now:${n}:${parts.sep}:-:${parts.zone}}}`
    })
  }

  // A param the test sent, with each fake time in it as the real one Postgres must get, or as the file's token.
  const replaceFakes = (text: string, by: (real: { micros: number; n: number }, parts: Parts) => string) =>
    text.replace(timestamp, (...match) => {
      const parts = parse(match as unknown as RegExpExecArray)
      const real = reals.get(parts.micros)
      return real === undefined ? match[0] : by(real, parts)
    })
  const toReal = (text: string) => replaceFakes(text, ({ micros }, parts) => format(micros, { ...parts, digits: '6' }))
  const toKept = (text: string) => replaceFakes(text, ({ n }, parts) => `{{now:${n}:${parts.sep}:${parts.digits}:${parts.zone}}}`)

  return { encodeResult, toReal, toKept }
}
