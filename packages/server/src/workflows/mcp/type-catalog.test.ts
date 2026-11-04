import { describe, expect, it } from 'vitest'
import { stepTypeNames } from '../step-types'
import { stepTypeCatalog, triggerCatalog } from './type-catalog'

describe('the step type and trigger catalog', () => {
  it('describes every step type the app runs, and no other', () => {
    expect(stepTypeCatalog.map((entry) => entry.resource)).toEqual([...stepTypeNames])
  })

  it('names each trigger the language has, each example holding just it', () => {
    expect(triggerCatalog.map((entry) => entry.trigger).sort()).toEqual(['mail', 'manual', 'record', 'schedule', 'webhook'])
    for (const entry of triggerCatalog) expect(Object.keys(entry.example as object)).toEqual([entry.trigger])
  })
})
