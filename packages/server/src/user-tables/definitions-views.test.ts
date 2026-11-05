import { describe, expect, it } from 'vitest'
import { checkViews } from '../check-views'
import { buildRegistry } from '../registry'
import { definitionsResources } from './definitions-resources'
import { fieldsView, fieldTypeLabels, tablesView } from './definitions-views'
import { definitionFieldTypes } from './names'

const { tables, fields } = definitionsResources({ roles: true, taken: [] })
const registry = buildRegistry([tables, fields])

describe('the views over the definitions', () => {
  it('fit their resources', () => {
    expect(() => checkViews(registry, [tablesView.toModel(), fieldsView.toModel()])).not.toThrow()
  })

  it("link a table to its own list, by its name, and to a new field of it", () => {
    const runs = Object.fromEntries(tablesView.toModel().actions.map((action) => [action.name, action.run]))
    expect(runs).toEqual({
      open_table: { kind: 'link', to: { kind: 'list', resource: '{table_name}' } },
      add_field: { kind: 'link', to: { kind: 'create', resource: 'user_table_fields', values: { table_id: '{id}' } } },
    })
  })

  it('show the Tables entry to those who may make tables, and list the fields of a table in their order', () => {
    const model = tablesView.toModel()
    expect(model.nav).toEqual({ creatorsOnly: true, order: 0 })
    expect(model.layout).toContainEqual(expect.objectContaining({ kind: 'related', resource: 'user_table_fields', field: 'table_id', sort: 'position' }))
  })

  it('label every field type, never by its identifier, and leave off the create form what it cannot take', () => {
    expect(Object.keys(fieldTypeLabels).sort()).toEqual([...definitionFieldTypes].sort())
    expect(fieldsView.toModel().fields.type?.valueLabels).toEqual(fieldTypeLabels)
    expect(fieldsView.toModel().fields.required?.notOnCreate).toBe(true)
    expect(tablesView.toModel().fields.title_field?.notOnCreate).toBe(true)
  })
})
