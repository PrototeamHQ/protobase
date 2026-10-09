import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SidebarMode } from '../app-shell'
import { LiveApp, type LiveStart } from './live-app'

const live = (start: LiveStart, sidebarMode?: SidebarMode): StoryObj => ({
  render: (_args, { globals }) => (
    <div className="h-screen">
      <LiveApp baseUrl={String(globals.apiBase ?? '/api/v1')} start={start} sidebarMode={sidebarMode} />
    </div>
  ),
})

const meta = { title: 'Live', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

export const Orders = live({ path: '/orders' })

export const OrdersFiltered = live({ path: `/orders?${new URLSearchParams({ filter: 'in(status, "confirmed", "picking") AND createdAt >= now() - 30d' })}` })

export const StockMoves = live({ path: '/stockMoves?layout=panel' }, 'icon')

export const Invoices = live({ path: '/invoices' })

export const InvoiceRecord = live({ firstOf: 'invoices' })

export const OrderRecord = live({ firstOf: 'orders' })

export const Companies = live({ path: '/companies' })

export const NewOrder = live({ path: '/orders/new' })

export const NewCompany = live({ path: '/companies/new' })
