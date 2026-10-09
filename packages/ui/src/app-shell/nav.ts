import type { LucideIcon } from 'lucide-react'
import type { StatusTone } from '@protobase/schema'
import { BarChart3, Boxes, Building2, CreditCard, FileText, Package, Receipt, Settings, ShoppingCart, Truck, Users, Warehouse } from 'lucide-react'

export const navGroups: NavGroup[] = [
  {
    label: 'Sales',
    items: [
      { id: 'orders', label: 'Orders', icon: ShoppingCart, count: 12 },
      { id: 'customers', label: 'Customers', icon: Building2 },
      { id: 'invoices', label: 'Invoices', icon: FileText, count: 3 },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { id: 'products', label: 'Products', icon: Package },
      { id: 'stock-moves', label: 'Stock moves', icon: Boxes },
      { id: 'warehouses', label: 'Warehouses', icon: Warehouse },
      { id: 'shipments', label: 'Shipments', icon: Truck },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'payments', label: 'Payments', icon: CreditCard },
      { id: 'credit-notes', label: 'Credit notes', icon: Receipt },
      { id: 'reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'users', label: 'Users', icon: Users },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

/** One record under a sidebar entry: its title, where it opens, its status as shown and its status dot. */
export type NavRecord = { id: string; label: string; href: string; status: string; tone: StatusTone; pulse: boolean; active: boolean }

/** The records a collapsible entry lists, as far as they have loaded. */
export type NavRecent =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; records: NavRecord[] }

export type NavItem = {
  id: string
  label: string
  icon: LucideIcon
  count?: number
  href?: string
  /** Makes the entry collapsible, listing these records and "View all" under it (text sidebars only). */
  recent?: NavRecent
}
export type NavGroup = { label: string; items: NavItem[] }
