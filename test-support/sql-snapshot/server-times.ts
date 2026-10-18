// Times the Postgres clock made (now(), clock_timestamp(), a default) differ on every recording. A recording keeps
// them as tokens, numbered in the order they first came back, and the test sees each as a fixed time instead: the
// fake time `fakeServerTime(n)`, a day before the tests' clock (see clock.ts), n milliseconds apart. A param the test
// sends with one of those fake times goes to Postgres as the real time it stands for, so the database still finds it.

/** Times after this, in what Postgres returns, are the Postgres clock's; fixture data must stay before it. */
const serverTimesAfter = Date.UTC(2026, 7, 1)
const fakeBase = Date.UTC(2026, 0, 14, 0, 0, 0)

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
  const numbers = new Map<number, number>()
  const reals = new Map<number, number>()
  // The real clock: the tests' Date is fake.
  const isServerTime = (micros: number) => micros > serverTimesAfter * 1000 && micros < (performance.timeOrigin + performance.now() + 86_400_000) * 1000

  /** Postgres's text with its clock's times as tokens; new times are numbered in time order. */
  const encodeResult = (texts: string[]) => {
    const fresh = new Set<number>()
    for (const text of texts) for (const match of text.matchAll(timestamp)) {
      const { micros, utc, zone } = parse(match)
      if (!isServerTime(micros) || numbers.has(micros)) continue
      if (!utc) throw new Error(`Postgres returned a time in zone ${zone}; the snapshot tests need its TimeZone to be UTC`)
      fresh.add(micros)
    }
    for (const micros of [...fresh].sort((a, b) => a - b)) {
      const n = numbers.size + 1
      numbers.set(micros, n)
      reals.set(fakeServerTime(n), micros)
    }
    return (text: string) => text.replace(timestamp, (...match) => {
      const parts = parse(match as unknown as RegExpExecArray)
      const n = numbers.get(parts.micros)
      return n === undefined || !isServerTime(parts.micros) ? match[0] : `{{now:${n}:${parts.sep}:${parts.digits}:${parts.zone}}}`
    })
  }

  /** A param the test sent, as Postgres must get it (`real`) and as the file keeps it (`kept`). */
  const encodeParam = (text: string) => {
    let real = text
    let kept = text
    for (const match of text.matchAll(timestamp)) {
      const parts = parse(match)
      const micros = reals.get(parts.micros)
      if (micros === undefined) continue
      real = real.replace(match[0], format(micros, { ...parts, digits: '6' }))
      kept = kept.replace(match[0], `{{now:${numbers.get(micros)}:${parts.sep}:${parts.digits}:${parts.zone}}}`)
    }
    return { real, kept }
  }

  return { encodeResult, encodeParam }
}
