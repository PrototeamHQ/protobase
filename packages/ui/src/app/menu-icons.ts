import { Bell, BookOpen, Bookmark, Building2, CreditCard, ExternalLink, FileText, Globe2, Heart, KeyRound, LayoutDashboard, LifeBuoy, Mail, Package, Receipt, Settings, ShieldCheck, ShoppingCart, Table2, Tags, Users, Warehouse, type LucideIcon } from 'lucide-react'
import type { MetaData } from '../data/meta-data'

const byName: Record<string, LucideIcon> = {
  bell: Bell,
  'book-open': BookOpen,
  bookmark: Bookmark,
  building: Building2,
  'credit-card': CreditCard,
  'external-link': ExternalLink,
  'file-text': FileText,
  globe: Globe2,
  heart: Heart,
  key: KeyRound,
  'layout-dashboard': LayoutDashboard,
  'life-buoy': LifeBuoy,
  mail: Mail,
  package: Package,
  receipt: Receipt,
  settings: Settings,
  shield: ShieldCheck,
  'shopping-cart': ShoppingCart,
  tags: Tags,
  users: Users,
  warehouse: Warehouse,
}

/** The names a view's, a menu item's or a page's `icon` may use; anything else falls back to the default icon. */
export const menuIconNames = Object.keys(byName)

export const menuIcon = (name: string | undefined, fallback: LucideIcon) => (name ? (byName[name] ?? fallback) : fallback)

/** A resource's icon in the sidebar, bottom bar and user menu: the one its view names, or a visitor's sign-in prompt's view, else a table. */
export const resourceIcon = (meta: MetaData, resource: string) => menuIcon(meta.views[resource]?.icon ?? meta.signIn?.[resource]?.icon, Table2)
