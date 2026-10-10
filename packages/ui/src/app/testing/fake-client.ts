import { ApiError, type Client, type ResourcePermissions } from '@protobase/client'
import type { NavModel, ResourceModel, UserMenuModel, ViewModel } from '@protobase/schema'

const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra })

const orders = {
  name: 'orders',
  table: { schema: 'sales', name: 'orders' },
  primaryKey: ['id'],
  fields: { id: field('id', 'text', { readOnly: true }), number: field('number', 'text', { sortable: true }), status: field('status', 'enum', { enumValues: ['draft', 'shipped'] }) },
} as unknown as ResourceModel

const ordersView = { resource: 'orders', names: { singular: 'Order', plural: 'Orders' }, list: { columns: ['number', 'status'] }, fields: { status: { valueLabels: { draft: 'Draft', shipped: 'Shipped' } } }, filters: [], layout: [], actions: [] } as unknown as ViewModel

const rows = ['SO-1', 'SO-2', 'SO-3'].map((number, index) => ({ id: `o${index + 1}`, number, status: index === 0 ? 'draft' : 'shipped', etag: `"v${index + 1}"` }))

export const forbidden = (detail: string) => new ApiError({ type: 'urn:protobase:problem:access-denied', title: 'Forbidden', status: 403, detail })

export type FakeClientOptions = {
  permissions: ResourcePermissions
  remove?: (key: string, etag?: string) => Promise<void>
  /** The orders view's sidebar placement, for example a `recent` group. */
  nav?: NavModel
  userMenu?: UserMenuModel
  /** What `/meta` says of the assistant. */
  assistant?: { url: string }
  /** What `/meta` says of the runtime endpoint. */
  runtime?: { url: string }
}

/** A server with one resource, for stories and tests that need permissions or failures the real ERP cannot give. */
export const fakeClient = ({ permissions, remove, nav, userMenu, assistant, runtime }: FakeClientOptions) =>
  ({
    meta: async () => ({ status: 'modified' as const, etag: '"meta"', meta: { resources: [orders], views: [{ ...ordersView, ...(nav && { nav }) }], permissions: { orders: permissions }, ...(userMenu && { userMenu }), ...(assistant && { assistant }), ...(runtime && { runtime }) } }),
    list: async () => ({ items: rows, nextPageToken: '', totalSizeEstimate: rows.length }),
    get: async (_resource: string, key: string) => ({ record: rows.find((row) => row.id === key) ?? rows[0]!, etag: rows.find((row) => row.id === key)?.etag ?? '"v1"' }),
    remove: async (_resource: string, key: string, options?: { etag?: string }) => remove?.(key, options?.etag),
  }) as unknown as Client
