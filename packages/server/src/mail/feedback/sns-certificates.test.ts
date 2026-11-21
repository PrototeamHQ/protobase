import { describe, expect, it } from 'vitest'
import { keptCertificates } from './sns-certificates'

describe('kept certificates', () => {
  it('fetch each certificate once an hour, keeping at most 16', async () => {
    let now = 0
    const fetched: string[] = []
    const kept = keptCertificates(async (url) => { fetched.push(url); return `pem of ${url}` }, () => now)
    expect(await kept('a')).toBe('pem of a')
    await kept('a')
    expect(fetched).toEqual(['a'])
    now = 60 * 60 * 1000
    await kept('a')
    expect(fetched).toEqual(['a', 'a'])
    for (let index = 0; index < 16; index++) await kept(`b${index}`)
    fetched.length = 0
    await kept('a')
    await kept('b15')
    expect(fetched).toEqual(['a'])
  })
})
