import { Zap, type LucideIcon } from 'lucide-react'
import { namedIcon } from './named-icon'

export const actionIcon = (name: string | undefined): LucideIcon => namedIcon(name) ?? Zap
