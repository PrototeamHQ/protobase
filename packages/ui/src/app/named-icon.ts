import { Bath, Bed, Bell, Bookmark, Calendar, DoorOpen, ExternalLink, FileText, Heart, House, KeyRound, LandPlot, Leaf, RulerDimensionLine, Send, Tag, Wallet, type LucideIcon } from 'lucide-react'

/** The icons an action's, a field's or a sign-in prompt's `icon` may name. */
const byName: Record<string, LucideIcon> = {
  wallet: Wallet,
  'file-text': FileText,
  send: Send,
  ruler: RulerDimensionLine,
  bed: Bed,
  bath: Bath,
  house: House,
  'door-open': DoorOpen,
  'land-plot': LandPlot,
  leaf: Leaf,
  tag: Tag,
  key: KeyRound,
  calendar: Calendar,
  heart: Heart,
  bell: Bell,
  bookmark: Bookmark,
  'external-link': ExternalLink,
}

/** The icon a name stands for, or nothing for a name the app does not know. */
export const namedIcon = (name: string | undefined): LucideIcon | undefined => (name !== undefined && Object.hasOwn(byName, name) ? byName[name] : undefined)
