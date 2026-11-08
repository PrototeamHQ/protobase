import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { Db } from '@protobase/query'
import type { Deps } from '../deps'
import { buildRegistry } from '../registry'
import { requestAccess } from '../request-access'
import { reorderIn } from './reorder'

// A rank the caller may read and write, and one whose stored values no response carries.
const steps = resource('steps')
  .table('steps')
  .fields({
    id: f.integer().readOnly(),
    rank: f.integer(),
    secret_rank: f.integer().sensitive(),
  })
  .primaryKey((r) => r.id)

const registry = buildRegistry([steps])
// No database: each refusal below must come before anything reads or locks.
const deps = { registry, accessOptions: {}, settingsResources: new Set() } as unknown as Deps
const session = { user: { id: '1', roles: ['admin'] } }
const unknownField = (field: string) => ({ extras: { errors: [{ field, code: 'unknown-field', message: `Unknown field "${field}"` }] } })

describe('ordering by a field', () => {
  it('refuses a sensitive field as unknown, so a reorder never reports its stored values', async () => {
    const access = await requestAccess(deps, registry.find('steps')!, session)
    const reorder = reorderIn(undefined as unknown as Db, deps, access, { field: 'secret_rank', keys: [[1], [2]], etags: {}, start: 1 }, [])
    await expect(reorder).rejects.toMatchObject(unknownField('secret_rank'))
  })
})
