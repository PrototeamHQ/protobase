import { sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { resolveNames } from '../src/better-auth/names/resolve-names'
import type { StoreSql } from '../src/better-auth/store/store-sql'
import type { PersonalMail } from '../src/personal-mail/personal-mailer'
import type { SenderAddressVerifier, VerifyInput } from '../src/personal-mail/verifiers/sender-address-verifier'
import { senderVerifications } from '../src/personal-mail/verifiers/sender-verifications'
import { verificationStore } from '../src/personal-mail/verifiers/verification-store'
import { sweepVerifications } from '../src/personal-mail/verifiers/verification-sweep'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'

// The From address verifications when several things act on them at once: starts, reports and sweeps, each on its own
// connection, as several requests and workers do. A recording replays one query at a time, so these run on Postgres.
vi.setConfig({ testTimeout: 60_000 })

const ready = await postgresTemplateReady('auth')
const farAhead = new Date('2099-01-01T00:00:00Z')
const verified = { state: 'verified', valid_until: farAhead } as const

/** A promise to settle by hand, so a verifier's call waits until the test lets it go on. */
const gate = () => {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { open, opened }
}

// The auth store with Ana's addresses, and the app's verifiers over it.
const serve = async (verifiers: SenderAddressVerifier[], addresses = ['billing@shop.example']) => {
  const database = await openPostgresDatabase('auth')
  const store: StoreSql = { db: database.db, table: resolveNames({ schema: undefined }).table, newId: sql`gen_random_uuid()::text` }
  await database.exec(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('ana', 'Ana', 'ana@example.com', true, now(), now())`)
  for (const [i, address] of addresses.entries()) await database.exec(`insert into mail_sender (id, user_id, address, shared, is_default, created_at, typed_at) values ('s${i}', 'ana', '${address}', false, false, now(), now())`)
  const send = vi.fn(async () => ({}))
  const store_ = verificationStore(async () => store)
  const verifications = senderVerifications(verifiers, store_, () => ({ send }) as unknown as PersonalMail)
  const rows = async () => (await database.db.executeQuery<{ sender_id: string; state: string; error_code: string | null }>(sql`select sender_id, state, error_code from mail_sender_verification order by sender_id, created_at`.compile(database.db))).rows
  const start = (i = 0) => verifications.start('ana', { id: `s${i}`, address: addresses[i]!, name: null }, 'en')
  return { database, store: store_, verifications, send, rows, start }
}

// A verifier whose verify sends its test and answers pending; each input it got is kept.
const pendingVerifier = (wait?: Promise<void>, check?: SenderAddressVerifier['check']) => {
  const inputs: VerifyInput[] = []
  const verifier: SenderAddressVerifier = {
    id: 'test-mail',
    verify: async (input, tools) => {
      inputs.push(input)
      await tools.send({ to: 'check@verify.example', subject: 'Test', text: 'A test message.' })
      await wait
      return { state: 'pending', expires_at: farAhead }
    },
    ...(check && { check }),
  }
  return { verifier, inputs }
}

describe.skipIf(!ready)('From address verifications at once', () => {
  it('send one test for two starts at the same time', async () => {
    const slow = gate()
    const { verifier, inputs } = pendingVerifier(slow.opened)
    const { start, send, rows, database } = await serve([verifier])
    const both = Promise.all([start(), start()])
    await vi.waitFor(() => expect(inputs).toHaveLength(1))
    slow.open()
    await both
    expect(inputs).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(await rows()).toEqual([{ sender_id: 's0', state: 'pending', error_code: null }])
    await database.close()
  })

  it('settle once for two reports with the right secret at the same time', async () => {
    const { verifier, inputs } = pendingVerifier()
    const { start, verifications, rows, database } = await serve([verifier])
    await start()
    const answers = await Promise.all([verifications.report('test-mail', inputs[0]!.secret, verified), verifications.report('test-mail', inputs[0]!.secret, verified)])
    expect(answers.toSorted()).toEqual([false, true])
    expect(await rows()).toEqual([{ sender_id: 's0', state: 'verified', error_code: null }])
    await database.close()
  })

  it('end in one outcome when a report and the expiry meet', async () => {
    const { verifier, inputs } = pendingVerifier()
    const { start, store, verifications, rows, database } = await serve([verifier])
    await start()
    await database.exec(`update mail_sender_verification set expires_at = now() + interval '20 milliseconds'`)
    await new Promise((resolve) => setTimeout(resolve, 20))
    const [reported] = await Promise.all([verifications.report('test-mail', inputs[0]!.secret, verified), store.expireDue()])
    await store.expireDue()
    const [row] = await rows()
    expect(row).toEqual(reported ? { sender_id: 's0', state: 'verified', error_code: null } : { sender_id: 's0', state: 'failed', error_code: 'verification_expired' })
    await database.close()
  })

  it('keep a report that settled while a slow check was still running', async () => {
    const slow = gate()
    const checking = gate()
    const { verifier, inputs } = pendingVerifier(undefined, async () => {
      checking.open()
      await slow.opened
      return { state: 'pending' }
    })
    const { start, store, verifications, rows, database } = await serve([verifier])
    await start()
    await database.exec(`update mail_sender_verification set next_check_at = now() - interval '1 second'`)
    const sweep = sweepVerifications([verifier], store)
    await checking.opened
    expect(await verifications.report('test-mail', inputs[0]!.secret, verified)).toBe(true)
    slow.open()
    await sweep
    expect(await rows()).toEqual([{ sender_id: 's0', state: 'verified', error_code: null }])
    await database.close()
  })

  it('check each due verification once for two sweeps at the same time', async () => {
    const addresses = Array.from({ length: 6 }, (_, i) => `a${i}@shop.example`)
    const checked: string[] = []
    const { verifier } = pendingVerifier(undefined, async ({ address }) => {
      checked.push(address)
      await new Promise((resolve) => setTimeout(resolve, 30))
      return { state: 'pending' }
    })
    const { start, store, database } = await serve([verifier], addresses)
    for (const i of addresses.keys()) await start(i)
    await database.exec(`update mail_sender_verification set next_check_at = now() - interval '1 second'`)
    await Promise.all([sweepVerifications([verifier], store), sweepVerifications([verifier], store)])
    expect(checked.toSorted()).toEqual(addresses)
    await database.close()
  })
})
