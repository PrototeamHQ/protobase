import { defineRoles, f, resource } from '@protobase/schema'

// A shop's catalog, read by its staff, by the warehouse system and by visitors of the web store, who sign in to nothing.

export const roles = defineRoles<'products' | 'costs'>({
  admin: ['*'],
  editor: ['products.read', 'products.create', 'products.update'],
  buyer: ['products.read', 'costs.read'],
  // The warehouse system reads three columns and changes one. A column added later stays hidden from it.
  erp_sync: [{ 'products.read': ['sku', 'price', 'stock'] }, { 'products.update': ['stock'] }],
  // Requests without a token: what the web store shows, of published products only.
  anonymous: [{ 'products.read': { fields: ['name', 'slug', 'price', 'image'], filter: 'published = true' } }],
})

/** shop.products */
export const products = resource('products')
  .table('shop.products')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    sku: f.text().filterable().sortable(),
    name: f.text().filterable().sortable(),
    slug: f.text().filterable(),
    price: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    // Whoever reads products, only roles holding `costs.read` see what one costs the shop.
    cost_price: f.decimal({ precision: 10, scale: 2 }).access({ read: roles.can('costs.read') }),
    stock: f.integer().filterable(),
    image: f.file().accept(['image/*']).public().optional(),
    published: f.boolean().default(false).filterable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.name, r.sku])
