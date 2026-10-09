import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDatabase } from '../../src/dev/check-database'

describe('checkDatabase', () => {
  it('names the problem and the way to start the project database', async () => {
    const erp = path.resolve(__dirname, '../../../../examples/erp')
    await expect(checkDatabase('postgres://u:p@127.0.0.1:1/db', erp)).rejects.toThrow(
      /Cannot reach the database at 127\.0\.0\.1:1\/db: the connection was refused.*pnpm --filter erp db:up/s,
    )
  })
})
