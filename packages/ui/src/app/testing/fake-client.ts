import { ApiError, type Client, type NotificationHistoryClient, type ResourcePermissions } from '@protobase/client'
import type { FakeRings } from './fake-rings'
import type { ActionModel, BottomBarModel, NavModel, ResourceModel, UserMenuModel, ViewModel } from '@protobase/schema'

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
  /** The bottom bar `/meta` gives the caller. */
  bottomBar?: Omit<BottomBarModel, 'roles'>
  /** What `/meta` says of the assistant. */
  assistant?: { url: string }
  /** What `/meta` says of the runtime endpoint. */
  runtime?: { url: string }
  /** The orders view's named actions. */
  actions?: ActionModel[]
  /** A `website` text field on the orders, with its value by order number. */
  websites?: Record<string, string | null>
  /** The language `/meta` sets for the app's screens. */
  locale?: 'en' | 'nl'
  /** The app's name and own icon `/meta` gives; default Protobase's name and no icon. */
  app?: { name: string; icon?: string }
  /** The signed-in user's notification history, which turns the bell on in `/meta` (see `fakeInbox`). */
  inbox?: NotificationHistoryClient
  /** The calls ringing the signed-in user, which turns calls on in `/meta` (see `fakeRings`). */
  rings?: FakeRings
}

/** A server with one resource, for stories and tests that need permissions or failures the real ERP cannot give. */
export const fakeClient = ({ permissions, remove, nav, userMenu, bottomBar, assistant, runtime, actions, websites, locale, app, inbox, rings }: FakeClientOptions) => {
  const model = websites ? { ...orders, fields: { ...orders.fields, website: field('website', 'text', { nullable: true }) } } : orders
  const records = websites ? rows.map((row) => ({ ...row, website: websites[row.number] ?? null })) : rows
  return {
    meta: async () => ({ status: 'modified' as const, etag: '"meta"', meta: { appName: app?.name ?? 'Protobase', ...(app?.icon && { appIcon: app.icon }), resources: [model], views: [{ ...ordersView, ...(nav && { nav }), ...(actions && { actions }) }], permissions: { orders: permissions }, ...(userMenu && { userMenu }), ...(bottomBar && { bottomBar }), ...(assistant && { assistant }), ...(runtime && { runtime }), ...(locale && { locale }), ...(inbox && { notifications: { bell: true } }), ...(rings && { calls: true }) } }),
    list: async () => ({ items: records, nextPageToken: '', totalSizeEstimate: records.length }),
    get: async (_resource: string, key: string) => ({ record: records.find((row) => row.id === key) ?? records[0]!, etag: records.find((row) => row.id === key)?.etag ?? '"v1"' }),
    remove: async (_resource: string, key: string, options?: { etag?: string }) => remove?.(key, options?.etag),
    ...(inbox && { notifications: inbox }),
    ...(rings && { rings: rings.client, live: rings.live }),
  } as unknown as Client
}
