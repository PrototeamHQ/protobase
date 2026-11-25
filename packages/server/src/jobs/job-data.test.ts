import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { everyOrganization, scopedDb } from '@protobase/query'
import { jobData, organizationOf, readJobData } from './job-data'

const db = new Kysely<any>({
  dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (db) => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler() },
})
const scope = { tables: [{ schema: 'auth', table: 'member', column: 'organization_id' }] }

describe('organizationOf', () => {
  it("takes a scoped db's organization, and none from an unscoped, every-organization or plain db", () => {
    const scoped = scopedDb(db, scope, 'org_a')
    expect(organizationOf(scoped)).toBe('org_a')
    expect(organizationOf(scoped.unscoped('test'))).toBeUndefined()
    expect(organizationOf(scopedDb(db, scope, () => everyOrganization('test')))).toBeUndefined()
    expect(organizationOf(scopedDb(db, scope, undefined))).toBeUndefined()
    expect(organizationOf(db)).toBeUndefined()
  })
})

describe('jobData and readJobData', () => {
  it('stores the organization beside the payload and reads both back', () => {
    const data = jobData({ invoiceId: 1 }, 'org_a')
    expect(readJobData(JSON.parse(JSON.stringify(data)))).toEqual({ payload: { invoiceId: 1 }, organization: 'org_a' })
    expect(readJobData(jobData(null, 7))).toEqual({ payload: null, organization: 7 })
  })

  it('stores the payload alone without an organization, and reads it as working in none', () => {
    expect(jobData({ invoiceId: 1 }, undefined)).toEqual({ invoiceId: 1 })
    expect(jobData(undefined, undefined)).toBeNull()
    expect(readJobData({ invoiceId: 1 })).toEqual({ payload: { invoiceId: 1 }, organization: undefined })
    expect(readJobData([1, 2])).toEqual({ payload: [1, 2], organization: undefined })
  })

  it("keeps a payload's own organization fields as payload", () => {
    const own = { '~organization': 'org_b', organization: 'org_b', payload: 1 }
    expect(readJobData(jobData(own, 'org_a'))).toEqual({ payload: own, organization: 'org_a' })
    expect(readJobData(jobData(own, undefined))).toEqual({ payload: own, organization: undefined })
  })
})
