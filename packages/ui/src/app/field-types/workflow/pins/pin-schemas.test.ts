import { describe, expect, it } from 'vitest'
import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { dataGraph } from './data-graph'
import { inputPins } from './node-pins'
import { pinSchemas } from './pin-schemas'
import { makeId } from './pure-ids'

const types: WorkflowTypeList = {
  step_types: [
    {
      id: 'app:mail.template',
      kind: 'step',
      label: 'Send email',
      description: '',
      available: true,
      input: {
        type: 'object',
        required: ['template', 'to'],
        properties: { template: { type: 'string', enum: ['welcome'] }, to: { type: 'string' }, locale: { type: 'string', 'x-email-of': 'template', 'x-email-use': 'locale' }, data: { type: 'object', 'x-email-of': 'template' } },
      },
    },
  ],
  triggers: [],
  templates: [{ name: 'welcome', languages: ['en', 'nl'], schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, seats: { type: 'integer' } } } }],
}

const send = (template: string): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Send', States: { Send: { Type: 'Task', Resource: 'app:mail.template', Arguments: { template, to: 'a@example.com', data: { name: '{% $states.context.Execution.Input.name %}' } }, End: true } } },
})

describe('the pin schemas', () => {
  it("draw a template step's data as a pin per field of the template it names, and its locale as one of its languages", () => {
    const schemas = pinSchemas(types, {})
    const definition = send('welcome')
    const pins = inputPins(definition.stateMachine.States.Send!, schemas)
    expect(pins.map((pin) => [pin.key, pin.options])).toEqual([['template', ['welcome']], ['to', undefined], ['locale', ['en', 'nl']], ['data', undefined]])
    const make = dataGraph(definition, schemas).pure.find((node) => node.id === makeId('Send', 'data'))!
    expect(make.kind === 'make' && make.inputs.map((pin) => [pin.key, pin.type, pin.required])).toEqual([['name', { kinds: ['string'] }, true], ['seats', { kinds: ['integer'] }, false]])
    // A template the app does not have takes any data, and any locale
    const unknown = send('goodbye')
    expect(inputPins(unknown.stateMachine.States.Send!, schemas).find((pin) => pin.key === 'locale')).not.toHaveProperty('options')
    const open = dataGraph(unknown, schemas).pure.find((node) => node.id === makeId('Send', 'data'))!
    expect(open.kind === 'make' && open.inputs.map((pin) => [pin.key, pin.type])).toEqual([['name', { kinds: 'any' }]])
  })
})
