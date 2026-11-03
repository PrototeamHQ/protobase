import { describe, expect, it } from 'vitest'
import type { Db } from '@protobase/query'
import type { BuiltProject } from '../config/build-project'
import { projectUserTables } from './project-user-tables'

// A database that fails any query, so a read of the definitions fails the test.
const untouched = new Proxy({}, { get: () => { throw new Error('read the database') } }) as Db

describe('projectUserTables', () => {
  it('reads nothing and serves no user table while userTables is off, whatever the database holds', async () => {
    expect(await projectUserTables({} as BuiltProject, untouched)).toBeUndefined()
    expect(await projectUserTables({ userTables: false } as BuiltProject, untouched)).toBeUndefined()
  })
})
