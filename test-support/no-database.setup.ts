import { vi } from 'vitest'

// Setup for the unit tests and the snapshot tests' replay: a unit test that opens a Postgres connection belongs in
// tests/, and a snapshot test replays its recording instead, so doing either here throws. Importing a driver stays
// allowed: shared test support and bundled configs import one without using it.
const refuse = (what: string) => {
  throw new Error(`${what} started in a test that runs without a database; tests that start one belong in tests/, and snapshot tests replay their recording (bun run test:record)`)
}

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  class Client { constructor() { refuse('A pg client') } }
  class Pool { constructor() { refuse('A pg pool') } }
  return { ...original, Client, Pool, default: { ...original.default, Client, Pool } }
})

vi.mock('postgres', async (importOriginal) => {
  const original = await importOriginal<object>()
  const postgres = () => refuse('A postgres client')
  return { ...original, default: postgres }
})
