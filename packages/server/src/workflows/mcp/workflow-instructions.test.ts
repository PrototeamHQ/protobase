import { checkDefinition } from '@protobase/workflows'
import { describe, expect, it } from 'vitest'
import { workflowTypes } from '../workflow-types'
import { workflowInstructions } from './workflow-instructions'

describe('the workflow instructions', () => {
  it('give an example that the save check takes', () => {
    const example = JSON.parse(workflowInstructions.slice(workflowInstructions.indexOf('An example: ') + 'An example: '.length))
    expect(checkDefinition(example, workflowTypes().check)).toEqual([])
  })
})
