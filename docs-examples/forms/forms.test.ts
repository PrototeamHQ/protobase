import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAdmin } from '@protobase/server'
import { contactRequests, contactRequestsView } from './contact'
import { newContactRequests } from './notify'
import project from './protobase.config'
import { roles } from './roles'

// The documentation shows these files; this keeps what it says about them true.

const db = new Kysely<any>({
  dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (kysely) => new PostgresIntrospector(kysely), createQueryCompiler: () => new PostgresQueryCompiler() },
})

const start = () => createAdmin({ resources: [contactRequests], views: [contactRequestsView], subscriptions: [newContactRequests], db, authenticate: () => ({ user: { id: 1, roles: ['admin'] } }), options: { roles } })

describe('the contact form', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('asks for the request fields the anonymous role creates, five times a minute per client', () => {
    expect(contactRequestsView.toModel(contactRequests.toModel()).forms).toEqual([
      { name: 'contact', title: 'Contact us', fields: ['name', 'email', 'topic', 'message'], thanks: 'Thanks, we will reply within a day.', perMinute: 5 },
    ])
    expect(roles.limits).toEqual([{ role: 'anonymous', capability: 'contact_requests.create', fields: ['name', 'email', 'topic', 'message'] }])
    expect(project.jobs).toHaveProperty('emailContactRequest')
  })

  it('starts with a secret to sign its bot checks, and not without one', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', undefined)
    vi.stubEnv('PROTOBASE_FORMS_SECRET', undefined)
    expect(start).toThrow('Public forms need a secret')
    vi.stubEnv('PROTOBASE_FORMS_SECRET', 'a long random secret')
    expect(start().jobs.map((job) => job.name)).toContain('changes.dispatch')
  })
})
