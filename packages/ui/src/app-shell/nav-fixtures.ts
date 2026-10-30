import { BarChart3, Boxes, Building2, CreditCard, FileText, Package, Receipt, Settings, ShoppingCart, Truck, Users, Warehouse } from 'lucide-react'
import type { NavGroup } from './nav'

/** A sample app's sidebar, for stories and tests. */
export const sampleNavGroups: NavGroup[] = [
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
