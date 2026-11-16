import { describe, expect, it } from 'vitest'
import { checkDefinition, definitionFromParts, typeCatalog } from '@protobase/workflows'
import { z } from 'zod'
import { defineTemplate } from '../../mail/template/define-template'
import { workflowTypes } from '../workflow-types'

describe('the type catalog', () => {
  it('lists the built-in steps and triggers as their plugin declares them, and manual', () => {
    const catalog = typeCatalog(workflowTypes().types)
    expect(catalog.step_types.map((type) => type.id)).toEqual(['app:http', 'app:records.create', 'app:records.update', 'app:records.get', 'app:records.list', 'app:mail.send', 'app:mail.template', 'app:storage.put', 'app:storage.get', 'app:piece'])
    expect(catalog.triggers.map((type) => type.id)).toEqual(['manual', 'app:record', 'app:schedule', 'app:webhook', 'gmail:new_mail'])
    expect(catalog.step_types[0]).toMatchObject({ kind: 'step', available: true, errors: expect.objectContaining({ 'Http.AddressRefused': 'the host is not a public address' }) })
  })

  it("lists app:mail.template with the app's templates in its template enum, each with its languages and data schema", () => {
    const welcome = defineTemplate({ name: 'welcome', subject: 'Hi {{name}}', body: () => null })
    const invoice = defineTemplate({ name: 'invoice', subject: 'Invoice {{number}}', body: () => null })
    const { types, templates } = workflowTypes([], undefined, undefined, [welcome, invoice])
    const catalog = typeCatalog(types, templates)
    const step = catalog.step_types.find((type) => type.id === 'app:mail.template')!
    expect(step).toMatchObject({ label: 'Send email', input: { required: ['template', 'to'], properties: { template: { type: 'string', enum: ['welcome', 'invoice'] } } } })
    expect(step.errors).toMatchObject({ 'Mail.InvalidData': expect.any(String), 'Mail.UnknownTemplate': expect.any(String) })
    expect(catalog.templates).toEqual([
      { name: 'welcome', languages: ['en'], schema: welcome.dataSchema },
      { name: 'invoice', languages: ['en'], schema: invoice.dataSchema },
    ])
    expect(welcome.dataSchema).toMatchObject({ properties: { name: expect.any(Object) } })
    // An app without templates still lists the step, its template any name
    const bare = typeCatalog(workflowTypes().types)
    expect(bare.step_types.find((type) => type.id === 'app:mail.template')!.input.properties).toMatchObject({ template: { type: 'string' } })
    expect((bare.step_types.find((type) => type.id === 'app:mail.template')!.input.properties as Record<string, object>).template).not.toHaveProperty('enum')
    expect(bare).not.toHaveProperty('templates')
  })

  it("types each wire into a template step's data by the template's schema, in the save check", () => {
    const welcome = defineTemplate({ name: 'welcome', schema: z.object({ name: z.string() }), subject: 'Hi {{name}}', body: () => null })
    const { check } = workflowTypes([], undefined, undefined, [welcome])
    const definition = (name: string) => definitionFromParts({
      trigger: { manual: {} },
      state_machine: {
        QueryLanguage: 'JSONata',
        StartAt: 'Fetch',
        States: {
          Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com' }, Assign: { fetch: '{% $states.result %}' }, Next: 'Send' },
          Send: { Type: 'Task', Resource: 'app:mail.template', Arguments: { template: 'welcome', to: 'a@example.com', data: { name } }, End: true },
        },
      },
    })
    expect(checkDefinition(definition('{% $fetch.status %}'), check)).toEqual([{ state: 'Send', field: 'Arguments.data.name', message: 'reads $fetch.status, a whole number, where data.name takes text' }])
    expect(checkDefinition(definition('{% $fetch.body %}'), check)).toEqual([])
  })

  it('says only an automatic trigger needs its workflow enabled, as run_workflow runs a disabled one', () => {
    const { note } = typeCatalog([])
    expect(note).toContain('A trigger other than manual starts runs only while its workflow is enabled')
    expect(note).toContain('a manual workflow needs no enabled_version')
  })
})
