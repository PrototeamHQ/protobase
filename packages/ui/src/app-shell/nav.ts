import type { LucideIcon } from 'lucide-react'
import type { StatusTone } from '@protobase/schema'
import type { StatusMarkProps } from '../status/status-mark'

/** One record under a sidebar entry: its title, where it opens, and its status as shown with its dot, when the group has a status. */
export type NavRecord = { id: string; label: string; href: string; status?: { label: string; tone: StatusTone; pulse: boolean }; active: boolean }

/**
 * How a record under a sidebar entry stands out for the person reading, such as an unread conversation: `strong` draws
 * its title bold, `count` a badge at the end of its row (none at 0), and `label`, such as "3 mentions", is added to its
 * name for screen readers and its tooltip. `person`, a user id, names the one person the record stands for, such as
 * the other person in a direct message: the row shows their presence and status beside its title.
 */
export type RecordMark = { strong?: boolean; count?: number; label?: string; person?: string }

/** A record's mark as the sidebar draws it: its person, when it names one, as their presence and status. */
export type ShownMark = Omit<RecordMark, 'person'> & { person?: Pick<StatusMarkProps, 'status' | 'presence'> }

/** The records a collapsible entry lists, as far as they have loaded. */
export type NavRecent =
  | { state: 'loading' }
  | { state: 'error' }
  /** `useMarks`, a React hook the group calls while it shows the records, marks them by their `id`. */
  | { state: 'ready'; records: NavRecord[]; useMarks?: () => Record<string, ShownMark> | undefined }

export type NavItem = {
  id: string
  label: string
  icon: LucideIcon
  count?: number
  href?: string
  /** Makes the entry collapsible, listing these records and "View all" under it (text sidebars only). */
  recent?: NavRecent
  /** A link under the entry to its create form, such as "New message" (text sidebars only). */
  create?: { label: string; href: string }
  /** Why the entry cannot open what it names right now, such as another API that does not answer; marked beside it. */
  problem?: string
}
/** A group of sidebar entries; an empty `label` shows them without a heading. */
export type NavGroup = { label: string; items: NavItem[] }
