import { vi } from 'vitest'

// Setup for `pnpm test:unit`: a test that starts PGlite or opens a Postgres connection belongs in tests/, so doing it
// here throws. Importing a driver stays allowed: shared test support and bundled configs import one without using it.
const refuse = (what: string) => {
  throw new Error(`${what} started in a unit test; tests that start a database belong in tests/ (pnpm test)`)
}

vi.mock('@electric-sql/pglite', async (importOriginal) => {
  const original = await importOriginal<typeof import('@electric-sql/pglite')>()
  class PGlite {
    constructor() { refuse('PGlite') }
    static create() { refuse('PGlite') }
  }
  return { ...original, PGlite }
})

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
