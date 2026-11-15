import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { f, resource } from '@protobase/schema'
import { checkDefinition, definitionFromParts } from '@protobase/workflows'
import { describe, expect, it } from 'vitest'
import { workflowTypes } from '../workflow-types'

// The resources the examples use, as an app keeps contacts and notes on them
const contacts = resource('contacts')
  .table('contacts')
  .fields({ id: f.bigint().readOnly(), name: f.text(), email: f.text().optional(), status: f.enum(['lead', 'customer']).filterable(), created_at: f.timestamp().readOnly().sortable() })
  .primaryKey((r) => r.id)
  .events((e) => e.crud())
  .toModel()
const notes = resource('notes').table('notes').fields({ id: f.bigint().readOnly(), contact_id: f.relation('contacts'), text: f.text() }).primaryKey((r) => r.id).toModel()
const { check } = workflowTypes([], (name) => ({ contacts, notes })[name])

// The protobase agent skill's guide to writing workflows, beside its SKILL.md in @protobase/cli
const guide = await readFile(join(import.meta.dirname, '../../../../cli/skills/protobase/workflows.md'), 'utf8')
const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]!) as Record<string, unknown>)

describe('the skill’s guide to writing workflows', () => {
  it('gives examples in both orders, from a webhook, a record and a schedule', () => {
    expect(examples.map((example) => [Object.keys(example.trigger as object)[0], example.execution_order])).toEqual([
      ['app:webhook', 'data'],
      ['app:record', 'sequence'],
      ['app:schedule', 'data'],
    ])
  })

  it.each(examples.map((example) => [example.name, example]))('gives %s as a workflow the save check takes', (_, example) => {
    expect(checkDefinition(definitionFromParts(example as Parameters<typeof definitionFromParts>[0]), check)).toEqual([])
  })
})
