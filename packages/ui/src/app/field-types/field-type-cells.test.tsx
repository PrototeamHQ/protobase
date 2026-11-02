import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import { renderCell } from '../../data-grid/cells'
import type { ColumnSpec, GridRow } from '../../data-grid/column-spec'
import { withLabels } from '../../live/relation-labels'
import type { FieldWidget, FieldWidgetProps } from './field-widget'
import { withFieldTypeCells } from './field-type-cells'

const field = (name: string, extra: Partial<FieldModel> = {}) =>
  ({ name, column: name, type: 'text', nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel

const model = (name: string, fields: FieldModel[]) =>
  ({ name, primaryKey: ['id'], fields: Object.fromEntries(fields.map((f) => [f.name, f])) }) as unknown as ResourceModel

const networks = model('networks', [field('id'), field('name')])
const nics = model('vm_nics', [field('id'), field('network_id', { type: 'relation', relation: { resource: 'networks', columns: ['id'] } })])
const resources = { networks, vm_nics: nics }
const view = { fields: { network_id: { widget: { name: 'vm_network' } } } } as never
const spec: ColumnSpec = { id: 'network_id', header: 'Network', kind: 'relation', width: 160 }

const Shows = ({ value }: FieldWidgetProps) => <span>{typeof value === 'string' ? `key ${value}` : `not a key: ${String(value)}`}</span>

const row = (labels: Record<string, Record<string, string>>) => withLabels(resources, nics, ['network_id'], [{ id: 'n1', network_id: 'net-7' }], labels)[0] as GridRow

const drawn = (widget: FieldWidget, labels: Record<string, Record<string, string>>) => {
  const [column] = withFieldTypeCells([spec], nics, view, { vm_network: widget })
  return renderToStaticMarkup(<>{column!.render!(row(labels))}</>)
}

describe('withFieldTypeCells for a relation field', () => {
  it("hands a field type's display the relation's key, with and without a name", () => {
    const widget: FieldWidget = { of: ['relation'], display: Shows }
    expect(drawn(widget, { network_id: { 'net-7': 'default on kvm-a' } })).toBe('<span>key net-7</span>')
    expect(drawn(widget, {})).toBe('<span>key net-7</span>')
  })

  it("hands a field type's cell the relation's key", () => {
    const widget: FieldWidget = { of: ['relation'], display: () => null, cell: Shows }
    expect(drawn(widget, { network_id: { 'net-7': 'default on kvm-a' } })).toBe('<span>key net-7</span>')
  })

  it('leaves the built-in relation cell showing the name', () => {
    expect(renderToStaticMarkup(<>{renderCell(spec, row({ network_id: { 'net-7': 'default on kvm-a' } }).network_id)}</>)).toContain('default on kvm-a')
  })
})
