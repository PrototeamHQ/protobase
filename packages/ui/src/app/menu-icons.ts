import { Bell, BookOpen, Bookmark, Building2, CreditCard, ExternalLink, FileText, Heart, KeyRound, LayoutDashboard, LifeBuoy, Mail, Receipt, Settings, ShieldCheck, Users, type LucideIcon } from 'lucide-react'

const byName: Record<string, LucideIcon> = {
  bell: Bell,
  'book-open': BookOpen,
  bookmark: Bookmark,
  building: Building2,
  'credit-card': CreditCard,
  'external-link': ExternalLink,
  'file-text': FileText,
  heart: Heart,
  key: KeyRound,
  'layout-dashboard': LayoutDashboard,
  'life-buoy': LifeBuoy,
  mail: Mail,
  receipt: Receipt,
  settings: Settings,
  shield: ShieldCheck,
  users: Users,
}

/** The names a user menu item's or a page's `icon` may use; anything else falls back to the default icon. */
export const menuIconNames = Object.keys(byName)

export const menuIcon = (name: string | undefined, fallback: LucideIcon) => (name ? (byName[name] ?? fallback) : fallback)
