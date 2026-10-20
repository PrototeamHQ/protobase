import bcrypt from 'bcryptjs'
import { hashPassword } from 'better-auth/crypto'
import { describe, expect, it } from 'vitest'
import { verifyAcceptedHash } from './password-hashes'

describe('verifyAcceptedHash', () => {
  const verify = verifyAcceptedHash(['bcrypt'])

  // Each prefix bcrypt implementations write: `$2a$` (Supabase Auth's), `$2b$` and `$2y$`.
  it.each(['2a', '2b', '2y'])('verifies a $%s$ bcrypt hash', async (prefix) => {
    const hash = bcrypt.hashSync('short-pw1', 4).replace(/^\$2[aby]\$/, `$${prefix}$`)
    expect(await verify({ hash, password: 'short-pw1' })).toBe(true)
    expect(await verify({ hash, password: 'wrong-pw1' })).toBe(false)
  })

  it("verifies Better Auth's own scrypt hashes as before", async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verify({ hash, password: 'correct horse battery' })).toBe(true)
    expect(await verify({ hash, password: 'wrong horse battery' })).toBe(false)
  })

  it('accepts no bcrypt hash when bcrypt is not asked for', async () => {
    const hash = bcrypt.hashSync('short-pw1', 4)
    expect(await verifyAcceptedHash([])({ hash, password: 'short-pw1' }).catch(() => false)).toBe(false)
  })
})
