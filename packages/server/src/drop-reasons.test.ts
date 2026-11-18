import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { keepDropReasons } from './drop-reasons'
import { LostConnection } from './lost-connection'

const notQueryable = () => new Error('Client has encountered a connection error and is not queryable')
const terminated = () => Object.assign(new Error('terminating connection due to administrator command'), { severity: 'FATAL', code: '57P01' })

// A pg client whose queries answer with `answer`, checked out of a pool of that one client.
const poolOf = (answer: (sql: unknown) => Promise<unknown> | unknown) => {
  const client = Object.assign(new EventEmitter(), { processID: 7, query: vi.fn(async (sql: unknown) => answer(sql)), release: vi.fn() })
  const pool = keepDropReasons({ options: {}, connect: async () => client as any, end: async () => {} })
  return { client, pool }
}

describe('keepDropReasons', () => {
  it('fails a statement after the drop with the reason the client reported first', async () => {
    const { client, pool } = poolOf(() => Promise.reject(notQueryable()))
    const checkedOut = await pool.connect()
    const reason = terminated()
    client.emit('error', reason)
    client.emit('error', new Error('Connection terminated unexpectedly'))
    const error = await checkedOut.query('select 1', []).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LostConnection)
    expect((error as Error).message).toBe('Lost the database connection: terminating connection due to administrator command')
    expect((error as Error).cause).toBe(reason)
  })

  it('fails a statement in flight with the error that ended the session, and later ones with it too', async () => {
    const reason = terminated()
    const { client, pool } = poolOf(() => Promise.reject(reason))
    const checkedOut = await pool.connect()
    const inFlight = await checkedOut.query('select pg_sleep(5)', []).catch((e: unknown) => e)
    expect((inFlight as Error).cause).toBe(reason)
    client.emit('error', new Error('Connection terminated unexpectedly'))
    client.query.mockImplementation(() => Promise.reject(notQueryable()))
    const next = await checkedOut.query('rollback', []).catch((e: unknown) => e)
    expect((next as Error).cause).toBe(reason)
  })

  it('leaves a statement error on a connection that is still up as it is', async () => {
    const failed = Object.assign(new Error('duplicate key value'), { severity: 'ERROR', code: '23505' })
    const { pool } = poolOf(() => Promise.reject(failed))
    const checkedOut = await pool.connect()
    await expect(checkedOut.query('insert', [])).rejects.toBe(failed)
  })

  it('keeps a statement error the server reported, even once the connection dropped right after it', async () => {
    const failed = Object.assign(new Error('duplicate key value'), { severity: 'ERROR', code: '23505' })
    const { client, pool } = poolOf(() => Promise.reject(failed))
    const checkedOut = await pool.connect()
    client.emit('error', terminated())
    await expect(checkedOut.query('insert', [])).rejects.toBe(failed)
  })

  it('reads a session-ending error by its SQLSTATE, whatever language its severity is in', async () => {
    const reason = Object.assign(new Error('terminating connection due to idle-in-transaction timeout'), { severity: 'ВАЖНО', code: '25P03' })
    const { pool } = poolOf(() => Promise.reject(reason))
    const error = await (await pool.connect()).query('select 1', []).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LostConnection)
    expect((error as Error).cause).toBe(reason)
  })

  it('releases a dropped client with its reason, so the pool closes it, and a working one without', async () => {
    const { client, pool } = poolOf(() => ({ rows: [] }))
    ;(await pool.connect()).release()
    expect(client.release).toHaveBeenLastCalledWith(undefined)
    const reason = terminated()
    client.emit('error', reason)
    ;(await pool.connect()).release()
    expect(client.release).toHaveBeenLastCalledWith(reason)
  })

  it('listens on a client once however often it is checked out', async () => {
    const { client, pool } = poolOf(() => ({ rows: [] }))
    await pool.connect()
    await pool.connect()
    expect(client.listenerCount('error')).toBe(1)
  })

  it('hands a cursor to the client as it is', async () => {
    const cursor = { read: async () => [], close: async () => {} }
    const { client, pool } = poolOf(() => cursor)
    const checkedOut = await pool.connect()
    checkedOut.query(cursor)
    expect(client.query).toHaveBeenCalledWith(cursor)
  })
})
