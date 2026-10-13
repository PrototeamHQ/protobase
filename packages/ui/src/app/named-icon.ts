import { Bed, Bell, FileText, Heart, RulerDimensionLine, Send, Wallet, type LucideIcon } from 'lucide-react'

/** The icons an action's, a field's or a sign-in prompt's `icon` may name. */
const byName: Record<string, LucideIcon> = { wallet: Wallet, 'file-text': FileText, send: Send, ruler: RulerDimensionLine, bed: Bed, heart: Heart, bell: Bell }

/** The icon a name stands for, or nothing for a name the app does not know. */
export const namedIcon = (name: string | undefined): LucideIcon | undefined => (name !== undefined && Object.hasOwn(byName, name) ? byName[name] : undefined)
