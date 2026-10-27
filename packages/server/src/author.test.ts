import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { anonymousSession } from './anonymous'
import { withAuthor } from './author'
import type { Deps } from './deps'
import { buildRegistry } from './registry'
import { requestAccess, writableFields } from './request-access'
import { validateBody } from './validate-body'

const messages = resource('messages')
  .table('messages')
  .fields({ id: f.integer().readOnly(), body: f.text(), author_id: f.text() })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)

const registry = buildRegistry([messages])
const entry = registry.find('messages')!
const deps = { registry, accessOptions: {}, settingsResources: new Set() } as unknown as Deps
const ann = { user: { id: 'ann', roles: ['admin'] } }

const refusal = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as { extras?: { errors?: unknown[] } }).extras?.errors ?? error
  }
  throw new Error('The body was accepted')
}

describe('an author field', () => {
  it('is no one\'s to write, on create or on update, and so read-only in the model the user sees', async () => {
    const access = await requestAccess(deps, entry, ann)
    expect(writableFields(access, 'create')).toEqual(['body'])
    expect(writableFields(access, 'update')).toEqual(['body'])
    expect(access.model.author).toBe('author_id')
    expect(access.model.fields.author_id!.readOnly).toBe(true)
  })

  it("refuses a body that names it, so the client's value never reaches the record", async () => {
    const access = await requestAccess(deps, entry, ann)
    expect(refusal(() => validateBody(access, 'create', { body: 'Hi', author_id: 'bob' }))).toEqual([{ field: 'author_id', code: 'read-only', message: '"author_id" is read-only' }])
    expect(refusal(() => validateBody(access, 'update', { author_id: 'bob' }))).toEqual([{ field: 'author_id', code: 'read-only', message: '"author_id" is read-only' }])
  })

  it('is not required on create, and the create is stamped with the signed-in user', async () => {
    const access = await requestAccess(deps, entry, ann)
    expect(withAuthor(access, validateBody(access, 'create', { body: 'Hi' }))).toEqual({ body: 'Hi', author_id: 'ann' })
  })

  it('stays empty on a create by no one signed in, and untouched on a resource without one', async () => {
    expect(withAuthor({ full: entry.model, session: anonymousSession() }, { body: 'Hi' })).toEqual({ body: 'Hi' })
    expect(withAuthor({ full: { ...entry.model, author: undefined }, session: ann }, { body: 'Hi' })).toEqual({ body: 'Hi' })
  })
})
