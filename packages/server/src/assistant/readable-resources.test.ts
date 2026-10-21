import type { ResourceModel, ViewModel } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import type { Meta } from '../meta'
import { readableResources } from './readable-resources'

const model = (name: string) => ({ name }) as ResourceModel
const view = (resource: string) => ({ resource }) as ViewModel
const permissions = (read: boolean) => ({ read, create: true, update: false, delete: false, conditional: [] })

const meta = {
  forCaller: async () => ({
    body: { resources: [model('deals'), model('feedback')], views: [view('deals'), view('feedback')], permissions: { deals: permissions(true), feedback: permissions(false) } },
    etag: '"x"',
  }),
} as unknown as Pick<Meta, 'forCaller'>

describe('readableResources', () => {
  it('keeps the resources the caller may read with their views, leaving out a create-only one', async () => {
    expect(await readableResources(meta, { user: { id: 1, roles: ['sales'] } })).toEqual({ models: [model('deals')], views: [view('deals')] })
  })
})
