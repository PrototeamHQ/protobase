import { describe, expect, it } from 'vitest'
import { transactionStatements } from './database'

const wrap = (statements: string) => `
    BEGIN;
    SET LOCAL lock_timeout = 30000;
    SET LOCAL idle_in_transaction_session_timeout = 30000;
    ${statements};
    COMMIT;
  `

describe('transactionStatements', () => {
  it('leaves a text that starts no transaction alone', () => {
    expect(transactionStatements('SELECT 1')).toBeUndefined()
    expect(transactionStatements('\n  WITH x AS (SELECT 1) SELECT * FROM x')).toBeUndefined()
  })

  it("splits pg-boss's locked statement into its parts", () => {
    const lock = "SELECT pg_advisory_xact_lock(('x' || encode(sha224((current_database() || '.pgboss.jobscreate-queue')::bytea), 'hex'))::bit(64)::bigint)"
    const statement = `SELECT jobs.create_queue('a', '{"policy":"standard"}'::jsonb)`
    expect(transactionStatements(wrap(`${lock};\n${statement}`))).toEqual([
      'SET LOCAL lock_timeout = 30000',
      'SET LOCAL idle_in_transaction_session_timeout = 30000',
      lock,
      statement,
    ])
  })

  it('keeps a multi-line statement whole, and takes one without a lock', () => {
    const statement = 'WITH stats AS (\n  SELECT 1;\n) UPDATE jobs.queue SET x = 1'
    expect(transactionStatements(wrap(statement))).toEqual(['SET LOCAL lock_timeout = 30000', 'SET LOCAL idle_in_transaction_session_timeout = 30000', statement])
  })

  it('refuses a transaction in another shape', () => {
    expect(() => transactionStatements('BEGIN; SELECT 1; COMMIT;')).toThrow('Unexpected pg-boss transaction')
  })
})
