import { describe, expect, it } from 'vitest'
import type { Definition } from '@protobase/workflows'
import { definitionProblems } from './problems'

const withTrigger = (trigger: Definition['trigger']): Definition => ({ trigger, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } } })

describe('definitionProblems', () => {
  it('refuses a record trigger without its resource, as a save does', () => {
    expect(definitionProblems(withTrigger({ 'app:record': {} }))).toEqual([{ field: 'trigger.app:record.resource', message: 'is missing' }])
    expect(definitionProblems(withTrigger({ 'app:record': { resource: 'deals' } }))).toEqual([])
  })

  it('refuses a trigger type the editor does not offer', () => {
    expect(definitionProblems(withTrigger({ 'app:schedule': { cron: '0 6 * * *' } })).map((problem) => problem.field)).toEqual(['trigger'])
  })
})
