import { FileText, Send, Wallet, Zap, type LucideIcon } from 'lucide-react'

const byName: Record<string, LucideIcon> = { wallet: Wallet, 'file-text': FileText, send: Send }

export const actionIcon = (name: string | undefined): LucideIcon => (name ? (byName[name] ?? Zap) : Zap)
