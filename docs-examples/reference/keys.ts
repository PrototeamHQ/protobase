import { f, resource } from '@protobase/schema'

// Keys of more than one column, and a relation that points at one.

/** shop.stock: one row per part and size. */
export const stock = resource('stock')
  .table('shop.stock')
  .fields({
    partNo: f.text().filterable().sortable(),
    size: f.text().filterable().sortable(),
    onHand: f.integer().min(0),
  })
  .primaryKey((r) => [r.partNo, r.size])

/** shop.part_orders: parts ordered from suppliers. */
export const partOrders = resource('partOrders')
  .table('shop.part_orders')
  .fields({
    id: f.uuid().readOnly().filterable().dbDefault(),
    // Two columns hold the key of one stock row, in the order of its primary key.
    part: f.relation('stock').columns(['part_no', 'part_size']),
    quantity: f.integer().min(1).max(50),
    // Filters may say `ref` as well as `supplierReference`.
    supplierReference: f.text().alias('ref').filterable(),
    orderedAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
  })
  .primaryKey((r) => r.id)
