import { describe, expect, it } from 'vitest'
import { conditionProblems, conditionReadable } from './check-condition'
import { models } from './testing/models'

describe('conditionProblems', () => {
  it('accepts fields, relation paths and counts', () => {
    expect(conditionProblems('status = "active"', 'subscriptions', models)).toEqual([])
    expect(conditionProblems('plan.name = "Pro"', 'subscriptions', models)).toEqual([])
    expect(conditionProblems('plans.count > 1', 'subscriptions', models)).toEqual([])
  })

  it('refuses a syntax error', () => {
    expect(conditionProblems('status =', 'subscriptions', models)[0]).toMatch(/^"when" is not a valid condition: /)
  })

  it('refuses a field the record does not have', () => {
    expect(conditionProblems('nope = 1', 'subscriptions', models)).toEqual(['unknown field "nope" on subscriptions'])
  })

  it('refuses counting a resource that is not one', () => {
    expect(conditionProblems('nope.count > 1', 'subscriptions', models)).toEqual(['"when" counts "nope", which is not a resource'])
  })

  it('lets a condition without a record only count', () => {
    expect(conditionProblems('status = "a"', undefined, models)).toHaveLength(1)
    expect(conditionProblems('plans.count > 1', undefined, models)).toEqual([])
  })
})

describe('conditionReadable', () => {
  it('is true while every name is in the models and false otherwise', () => {
    expect(conditionReadable('status = "active"', 'subscriptions', models)).toBe(true)
    expect(conditionReadable('nope = 1', 'subscriptions', models)).toBe(false)
    expect(conditionReadable('status =', 'subscriptions', models)).toBe(false)
  })
})
