import type { RawResult } from './values'

// The OIDs of objects a test creates come from a counter the whole server shares, so they differ on every recording.
// A recording keeps them as tokens, numbered in the order they first came back, and the test sees each as a fixed OID
// far above any real one. Only a whole value from a query that reads the catalog counts, once the record backend has
// found an object with that OID (`learn`); the rest of what such a query returns stays as it is.

const token = /\{\{oid:(\d+)\}\}/g
const integer = /\b\d{5,10}\b/g
const fakeBase = 4_000_000_000

export const fakeServerOid = (n: number) => String(fakeBase + n)

/** Replaces each token in `text` with the fake OID it stands for. */
export const decodeOids = (text: string) => text.replace(token, (_, n: string) => fakeServerOid(Number(n)))

/** Whether `sql` reads the catalog, so that a number it returns may be an OID. */
export const readsCatalog = (sql: string) => /\bpg_|regclass|::oid\b/.test(sql)

// oid, regclass and text: an OID comes back as itself or cast to text, never as a count or an estimate's number.
const oidColumns = new Set([26, 2205, 25])

/**
 * Numbers that may be OIDs of objects a test made: whole values from 16384, the first OID Postgres gives them, in
 * columns that hold OIDs or text.
 */
export const oidCandidates = (results: RawResult[]) =>
  results.flatMap(({ columns, rows }) =>
    rows.flatMap((row) => row.filter((value, i): value is string => oidColumns.has(columns[i]![1]) && value !== null && /^\d{5,10}$/.test(value) && Number(value) >= 16384)))

/** The OIDs Postgres made in one recording, real on the way in and tokens in the file. */
export const createServerOids = () => {
  const numbers = new Map<string, number>()
  const reals = new Map<string, string>()

  /** Takes in OIDs the record backend found objects for. */
  const learn = (oids: string[]) => {
    for (const oid of oids) {
      if (numbers.has(oid)) continue
      const n = numbers.size + 1
      numbers.set(oid, n)
      reals.set(fakeServerOid(n), oid)
    }
  }

  const encodeResult = () => (text: string) => (numbers.has(text) ? `{{oid:${numbers.get(text)}}}` : text)
  const toReal = (text: string) => text.replace(integer, (value) => reals.get(value) ?? value)
  const toKept = (text: string) => text.replace(integer, (value) => (reals.has(value) ? `{{oid:${numbers.get(reals.get(value)!)}}}` : value))

  return { learn, encodeResult, toReal, toKept }
}
