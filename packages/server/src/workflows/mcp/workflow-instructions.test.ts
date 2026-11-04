import { checkDefinition } from '@protobase/workflows'
import { describe, expect, it } from 'vitest'
import { stepTypeNames } from '../step-types'
import { triggerCatalog } from './type-catalog'
import { workflowInstructions } from './workflow-instructions'

describe('the workflow instructions', () => {
  it('give an example that the save check takes', () => {
    const example = JSON.parse(workflowInstructions.slice(workflowInstructions.indexOf('An example: ') + 'An example: '.length))
    expect(checkDefinition(example, { resources: stepTypeNames })).toEqual([])
  })

  it('give trigger examples that the save check takes', () => {
    const machine = { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } }
    for (const { example } of triggerCatalog) expect(checkDefinition({ trigger: example, stateMachine: machine }, { resources: stepTypeNames })).toEqual([])
  })
})
