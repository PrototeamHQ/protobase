// The name of a clone (record-backend.ts) is the run's and the worker's, so it differs on every recording, and Postgres
// says it back, as current_database() does. A recording keeps each as a token, and the test sees `snapshot_<n>`.

const name = /snapshot_[0-9a-f]{8}_\d+_\d+_\d+/g
const token = /\{\{database:(\d+)\}\}/g
const fake = /\bsnapshot_\d+\b/g

const fakeName = (n: number) => `snapshot_${n}`

/** Replaces each token in `text` with the name the test sees for it. */
export const decodeNames = (text: string) => text.replace(token, (_, n: string) => fakeName(Number(n)))

/** The clone names Postgres said back in one recording, real on the way in and tokens in the file. */
export const createServerNames = () => {
  const numbers = new Map<string, number>()
  const reals = new Map<string, string>()

  const encodeResult = (texts: string[]) => {
    for (const text of texts) for (const [value] of text.matchAll(name)) {
      if (numbers.has(value)) continue
      const n = numbers.size + 1
      numbers.set(value, n)
      reals.set(fakeName(n), value)
    }
    return (text: string) => text.replace(name, (value) => `{{database:${numbers.get(value)}}}`)
  }
  const toReal = (text: string) => text.replace(fake, (value) => reals.get(value) ?? value)
  const toKept = (text: string) => text.replace(fake, (value) => (reals.has(value) ? `{{database:${numbers.get(reals.get(value)!)}}}` : value))

  return { encodeResult, toReal, toKept }
}
