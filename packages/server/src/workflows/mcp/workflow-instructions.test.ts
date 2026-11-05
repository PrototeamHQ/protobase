import { checkDefinition } from '@protobase/workflows'
import { describe, expect, it } from 'vitest'
import { workflowTypes } from '../workflow-types'
import { workflowInstructions } from './workflow-instructions'

describe('the workflow instructions', () => {
  it('give an example that the save check takes', () => {
    const example = JSON.parse(workflowInstructions.slice(workflowInstructions.indexOf('An example: ') + 'An example: '.length))
    expect(checkDefinition(example, workflowTypes().check)).toEqual([])
  })

  it('give the trigger as the value of "trigger", with { "manual": {} } as one of its forms', () => {
    const document = workflowInstructions.split('\n').find((line) => line.startsWith('A definition is one JSON document'))!
    expect(document).toContain('{ "trigger": <trigger>, "stateMachine": ')
    expect(document).toContain('<trigger> is an object with one key: { "<trigger id>": <its input> }')
    expect(document).toContain('or { "manual": {} }')
    expect(document).not.toMatch(/\}, or \{ "manual"/)
  })
})
