import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { checkAi } from './check-ai'

const fields = { id: f.integer(), title: f.text(), summary: f.text().optional() }
const plain = resource('tickets').table('tickets').fields(fields).primaryKey((r) => r.id)
const filled = resource('tickets').table('tickets').fields({ ...fields, summary: f.text().optional().ai({ prompt: 'Sum up {title}' }) }).primaryKey((r) => r.id)
const actions = view<typeof plain>('tickets').actions((a) => [a.ai('sum', { label: 'Sum up', prompt: '{title}', writes: 'summary' })]).toModel()

describe('checkAi', () => {
  it('wants a model for AI fields and AI actions, and nothing without them', () => {
    const need = 'AI fields and actions need a model: set PROTOBASE_ASSISTANT_API_KEY'
    expect(() => checkAi({ models: [filled.toModel()], views: [], assistant: undefined, env: {} })).toThrow(need)
    expect(() => checkAi({ models: [plain.toModel()], views: [actions], assistant: false, env: {} })).toThrow(need)
    expect(() => checkAi({ models: [plain.toModel()], views: [], assistant: undefined, env: {} })).not.toThrow()
    expect(() => checkAi({ models: [filled.toModel()], views: [actions], assistant: { apiKey: 'key' }, env: {} })).not.toThrow()
    expect(() => checkAi({ models: [filled.toModel()], views: [], assistant: false, env: { PROTOBASE_ASSISTANT_API_KEY: 'key' } })).not.toThrow()
  })
})
