import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findLeak, mailboxPlaceholder, tokenFields } from './scrub'
import { recordingDirs } from './write'

// Every committed recording and provider snapshot of Google, as files.
const files = Object.values(recordingDirs).flatMap((dir) => readdirSync(dir).map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8') })))

// Every value of a token field, at any depth.
const tokenValues = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value.flatMap(tokenValues)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, item]) => [...((tokenFields as readonly string[]).includes(key) ? [item] : []), ...tokenValues(item)])
}

describe('the committed Google recordings', () => {
  it('hold no Google token or client shape and no address off example.com, in a raw mail neither', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.filter(({ text }) => findLeak(JSON.parse(text), []) ?? findLeak(text, [])).map(({ file }) => file)).toEqual([])
  })

  it('hold a placeholder in every token field, so no token answer keeps a real token', () => {
    const values = files.flatMap(({ text }) => tokenValues(JSON.parse(text)))
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) expect(value).toMatch(/^snapshot-[a-z_]+-\d+$/)
  })

  it("give the mailbox's placeholder address as the profile's", () => {
    const profile = JSON.parse(files.find(({ file }) => file === 'profile.json')!.text) as { response: { body: { emailAddress: string } } }
    expect(profile.response.body.emailAddress).toBe(mailboxPlaceholder)
  })
})
