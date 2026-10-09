import { Boxes, Building2, CreditCard, FileText, Globe2, Package, Receipt, Settings, ShoppingCart, Table2, Tags, Truck, Users, Warehouse, type LucideIcon } from 'lucide-react'

const byResource: Record<string, LucideIcon> = {
  orders: ShoppingCart,
  orderLines: ShoppingCart,
  companies: Building2,
  invoices: FileText,
  invoiceLines: Receipt,
  products: Package,
  categories: Tags,
  tags: Tags,
  companyTags: Tags,
  stockMoves: Boxes,
  stockLevels: Boxes,
  warehouses: Warehouse,
  locations: Warehouse,
  people: Users,
  users: Users,
  empMaster: Users,
  organizations: Settings,
  countries: Globe2,
  currencies: CreditCard,
  shipments: Truck,
}

export const iconFor = (resource: string) => byResource[resource] ?? Table2
