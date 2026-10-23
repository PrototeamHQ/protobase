import { describe, expect, it } from 'vitest'
import { connectLong } from './long-connect'

describe('connectLong', () => {
  it('says what a pooler that refuses statement_timeout at login lacks', async () => {
    const refused = Object.assign(new Error('unsupported startup parameter: statement_timeout'), { code: '08P01' })
    await expect(connectLong({ connect: () => Promise.reject(refused) })()).rejects.toThrow(
      'The database refused statement_timeout at login, which longQueries needs: a PgBouncer in front of it must list statement_timeout in track_extra_parameters',
    )
  })

  it('keeps any other failure as it is', async () => {
    const refused = Object.assign(new Error('password authentication failed'), { code: '28P01' })
    await expect(connectLong({ connect: () => Promise.reject(refused) })()).rejects.toBe(refused)
  })
})
