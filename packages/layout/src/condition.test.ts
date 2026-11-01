import { describe, expect, it } from 'vitest'
import { countedResource, evaluateCondition, parseCondition, type Condition } from './condition'

const parsed = (source: string): Condition => {
  const result = parseCondition(source)
  if (!result.ok) throw new Error(result.message)
  return result
}

describe('conditions', () => {
  it('lists the values a condition names, once each', () => {
    expect(parsed("status = 'active' AND billing_profiles.count > 1 OR status = 'trial'").paths).toEqual(['status', 'billing_profiles.count'])
  })

  it('evaluates comparisons, AND, OR and NOT against dotted values', () => {
    const values = { status: 'active', 'billing_profiles.count': 2, 'plan.name': 'Pro', seats: '12' }
    expect(evaluateCondition(parsed('billing_profiles.count > 1'), values)).toBe(true)
    expect(evaluateCondition(parsed('billing_profiles.count > 2'), values)).toBe(false)
    expect(evaluateCondition(parsed('plan.name = "Pro" AND NOT status = "canceled"'), values)).toBe(true)
    expect(evaluateCondition(parsed('seats >= 10 OR status = "trial"'), values)).toBe(true)
  })

  it('names a key and a field behind it in the same condition', () => {
    expect(evaluateCondition(parsed('plan = 3 AND plan.name = "Pro"'), { plan: 3, 'plan.name': 'Pro' })).toBe(true)
  })

  it('is false for values that are missing', () => {
    expect(evaluateCondition(parsed('missing = 1'), {})).toBe(false)
  })

  it('evaluates isNull(field) and NOT isNull(field)', () => {
    expect(evaluateCondition(parsed('isNull(parent_id)'), { parent_id: null })).toBe(true)
    expect(evaluateCondition(parsed('isNull(parent_id)'), {})).toBe(true)
    expect(evaluateCondition(parsed('isNull(parent_id)'), { parent_id: 7 })).toBe(false)
    expect(evaluateCondition(parsed('NOT isNull(parent_id)'), { parent_id: 7 })).toBe(true)
    expect(evaluateCondition(parsed('isNull(plan.name) OR status = "trial"'), { 'plan.name': 'Pro', status: 'trial' })).toBe(true)
  })

  it('evaluates in(field, ...) as any of its values', () => {
    expect(evaluateCondition(parsed('in(status, "a", "b")'), { status: 'a' })).toBe(true)
    expect(evaluateCondition(parsed('in(status, "a", "b")'), { status: 'c' })).toBe(false)
    expect(evaluateCondition(parsed('NOT in(seats, 1, 2)'), { seats: 3 })).toBe(true)
  })

  it('lists the field isNull and in name', () => {
    expect(parsed('isNull(parent_id) AND in(status, "a")').paths).toEqual(['parent_id', 'status'])
  })

  it('reports syntax errors and empty conditions', () => {
    expect(parseCondition('status = ')).toMatchObject({ ok: false })
    expect(parseCondition('   ')).toEqual({ ok: false, message: 'the condition is empty' })
  })

  it('tells a count from a field of the record around it', () => {
    expect(countedResource('invoices.count', () => false)).toBe('invoices')
    expect(countedResource('invoices.count', (name) => name === 'invoices')).toBeUndefined()
    expect(countedResource('plan.name', () => false)).toBeUndefined()
    expect(countedResource('a.count.b', () => false)).toBeUndefined()
  })
})
