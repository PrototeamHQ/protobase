import { describe, expect, it } from 'vitest'
import { checkDefinition } from '@protobase/workflows'
import { withStepsToCheck } from './save-hook'

const empty = { trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: '', States: {} } }
const types = { resources: [], required: {}, triggers: {} }

describe('withStepsToCheck', () => {
  it('lets a definition through for having no steps, and checks the rest of it', () => {
    expect(checkDefinition(withStepsToCheck(empty), types)).toEqual([])
    expect(checkDefinition(withStepsToCheck({ ...empty, trigger: { manual: {}, other: {} } }), types).length).toBeGreaterThan(0)
    expect(checkDefinition(withStepsToCheck({ ...empty, stateMachine: { ...empty.stateMachine, Comment: 1 } }), types).length).toBeGreaterThan(0)
  })

  it('leaves a definition with steps, or with a first step named, as it is', () => {
    const named = { ...empty, stateMachine: { ...empty.stateMachine, StartAt: 'Gone' } }
    expect(withStepsToCheck(named)).toBe(named)
  })
})
