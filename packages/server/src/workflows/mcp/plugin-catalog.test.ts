import { describe, expect, it } from 'vitest'
import { typeCatalog } from '@protobase/workflows'
import example from '../../../../../test-support/workflow-plugin-example'
import { workflowTypes } from '../workflow-types'

describe('a plugin of its own package in the type catalog', () => {
  it('lists its trigger and step exactly as the built-in ones are listed', () => {
    const catalog = typeCatalog(workflowTypes([{ plugin: example, source: 'workflow-plugin-example' }]).types)
    const shout = catalog.step_types.find((type) => type.id === 'example:shout')
    const builtIn = catalog.step_types.find((type) => type.id === 'app:http')
    // The same entry a built-in has, but the errors the fixture does not declare.
    expect(Object.keys(shout!).sort()).toEqual(Object.keys(builtIn!).filter((key) => key !== 'errors').sort())
    expect(shout).toMatchObject({ kind: 'step', label: 'Shout', available: true, input: { required: ['text'] } })
    expect(catalog.triggers.map((type) => type.id)).toEqual(['manual', 'app:record', 'app:schedule', 'app:webhook', 'example:new_note'])
  })
})
