import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkedSnapshot, loadSnapshot } from './snapshots'

describe('the provider snapshots', () => {
  it('keep a placeholder in every token field, and say whether they were recorded', () => {
    const answers = readdirSync(join(import.meta.dirname, 'snapshots', 'google')).map((file) => file.replace(/\.json$/, ''))
    expect(answers.length).toBeGreaterThan(0)
    for (const answer of answers) expect(typeof loadSnapshot('google', answer).stand_in).toBe('boolean')
  })

  it('refuses a recording that kept a live token', () => {
    const recorded = { ...loadSnapshot('google', 'token-code'), stand_in: false }
    expect(() => checkedSnapshot({ ...recorded, response: { ...recorded.response, body: { ...recorded.response.body, refresh_token: '1//0g-live-looking' } } }, 'google/token-code')).toThrow('refresh_token must be a placeholder')
  })
})
