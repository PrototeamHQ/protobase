import { checkDefinition, definitionFromParts } from '@protobase/workflows'
import { describe, expect, it } from 'vitest'
import { workflowTypes } from '../workflow-types'
import { workflowInstructions } from './workflow-instructions'

describe('the workflow instructions', () => {
  it('give an example in each order that the save check takes', () => {
    const tail = workflowInstructions.slice(workflowInstructions.indexOf('An example: ') + 'An example: '.length)
    const [sequence, data] = [tail.slice(0, tail.indexOf('. In data order: ')), tail.slice(tail.indexOf('. In data order: ') + '. In data order: '.length)].map((text) => JSON.parse(text))
    expect(checkDefinition(definitionFromParts(sequence), workflowTypes().check)).toEqual([])
    expect(checkDefinition(definitionFromParts({ trigger: { manual: {} }, ...data }), workflowTypes().check)).toEqual([])
  })

  it('give the trigger as the value of "trigger", with { "manual": {} } as one of its forms', () => {
    const document = workflowInstructions.split('\n').find((line) => line.startsWith("A workflow's definition is its fields"))!
    expect(document).toContain('trigger, an object with one key: { "<trigger id>": <its input> }')
    expect(document).toContain('or { "manual": {} }')
    expect(document).not.toMatch(/\}, or \{ "manual"/)
  })
})
