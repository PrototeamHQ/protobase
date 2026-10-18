// UUIDs Postgres made (gen_random_uuid(), uuidv7(), a default) differ on every recording, as its clock's times do
// (server-times.ts). A recording keeps them as tokens, numbered in the order they first came back, and the test sees
// each as a fixed UUID of the same version, ordered as the numbers are. A UUID counts as Postgres's when it is a v4 or
// v7 that comes back before the test sent it; the test's own come from its seeded sequence and go out first.

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-([47])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g
const anyUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
const token = /\{\{uuid:(\d+):([47])\}\}/g

export const fakeServerUuid = (n: number, version: string) => `00000000-0000-${version}000-8000-${n.toString(16).padStart(12, '0')}`

/** Replaces each token in `text` with the fake UUID it stands for. */
export const decodeUuids = (text: string) => text.replace(token, (_, n: string, version: string) => fakeServerUuid(Number(n), version))

/** The UUIDs Postgres made in one recording, real on the way in and tokens in the file. */
export const createServerUuids = () => {
  const numbers = new Map<string, number>()
  const reals = new Map<string, string>()
  const sent = new Set<string>()

  /** Postgres's text with the UUIDs it made as tokens. */
  const encodeResult = (texts: string[]) => {
    for (const text of texts) for (const [value, version] of text.matchAll(uuid)) {
      if (sent.has(value) || numbers.has(value)) continue
      const n = numbers.size + 1
      numbers.set(value, n)
      reals.set(fakeServerUuid(n, version!), value)
    }
    return (text: string) => text.replace(uuid, (value, version: string) => (numbers.has(value) ? `{{uuid:${numbers.get(value)}:${version}}}` : value))
  }

  /** A param the test sent, with each fake UUID in it as the real one Postgres must get; the rest counts as sent. */
  const toReal = (text: string) => {
    const real = text.replace(anyUuid, (value) => reals.get(value) ?? value)
    for (const [value] of real.matchAll(anyUuid)) if (!numbers.has(value)) sent.add(value)
    return real
  }
  /** A param the test sent, with each fake UUID in it as the file's token. */
  const toKept = (text: string) => text.replace(anyUuid, (value) => {
    const real = reals.get(value)
    return real === undefined ? value : `{{uuid:${numbers.get(real)}:${value[14]}}}`
  })

  return { encodeResult, toReal, toKept }
}
