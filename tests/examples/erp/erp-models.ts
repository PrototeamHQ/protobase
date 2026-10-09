import { checkFilter, parseFilter, type FieldModel, type FieldType, type ResourceModel } from '@protobase/schema'

const field = (name: string, type: FieldType, extra: Partial<FieldModel> = {}): FieldModel => ({
  name, column: name, type, nullable: false, readOnly: false, filterable: true, sortable: true, aliases: [], ...extra,
})

const model = (schema: string, name: string, primaryKey: string[], fields: FieldModel[], extra: Partial<ResourceModel> = {}): ResourceModel => ({
  name, table: { schema, name }, fields: Object.fromEntries(fields.map(f => [f.name, f])), primaryKey, ...extra,
})

const orderFields = [
  field('id', 'uuid'),
  field('organization_id', 'integer'),
  field('number', 'text'),
  field('status', 'text'),
  field('total', 'decimal'),
  field('paid', 'boolean'),
  field('notes', 'text', { nullable: true }),
  field('created_at', 'timestamp'),
]

const stockMoveFields = [
  field('id', 'bigint'),
  field('organization_id', 'integer'),
  field('product_id', 'bigint'),
  field('kind', 'text'),
  field('quantity', 'integer'),
  field('unit_cost', 'decimal'),
  field('reference', 'text', { nullable: true }),
  field('moved_at', 'timestamp'),
]

export const orders = model('sales', 'orders', ['id'], orderFields, { tenant: 'organization_id' })
/** Same table without tenant scoping, for table-wide estimates and statistics. */
export const allOrders = model('sales', 'orders', ['id'], orderFields)
export const stockMoves = model('inventory', 'stock_moves', ['id'], stockMoveFields, { tenant: 'organization_id' })
export const allStockMoves = model('inventory', 'stock_moves', ['id'], stockMoveFields)

/** AIP-160 text to a checked filter; throws with the checker's messages when it is invalid. */
export const check = (target: ResourceModel, source: string) => {
  const parsed = parseFilter(source)
  if (!parsed.ok || !parsed.ast) throw new Error(`Cannot parse "${source}": ${parsed.errors.map(e => e.message).join('; ')}`)
  const checked = checkFilter(target, parsed.ast)
  if (!checked.ok) throw new Error(`Cannot check "${source}": ${checked.errors.map(e => e.message).join('; ')}`)
  return checked.filter
}
