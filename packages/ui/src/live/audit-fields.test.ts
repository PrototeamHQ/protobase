import { describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import { auditField } from './audit-fields'

const model = (...names: string[]) => ({ fields: Object.fromEntries(names.map((name) => [name, { name }])) }) as unknown as ResourceModel

describe('auditField', () => {
  it('finds the snake_case and the camelCase names', () => {
    expect(auditField(model('id', 'created_at', 'updated_at'), 'created')).toBe('created_at')
    expect(auditField(model('id', 'createdAt', 'updatedAt'), 'updated')).toBe('updatedAt')
  })

  it('is undefined without one', () => {
    expect(auditField(model('id'), 'updated')).toBeUndefined()
  })
})
