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

  it('share a fetch that runs, and keep no failed one', async () => {
    let fetches = 0
    let fail = true
    const kept = keptCertificates(async (url) => {
      fetches++
      await Promise.resolve()
      if (fail) throw new Error('down')
      return `pem of ${url}`
    })
    await expect(Promise.all([kept('a'), kept('a')])).rejects.toThrow('down')
    expect(fetches).toBe(1)
    fail = false
    expect(await Promise.all([kept('a'), kept('a')])).toEqual(['pem of a', 'pem of a'])
    expect(fetches).toBe(2)
  })
})
