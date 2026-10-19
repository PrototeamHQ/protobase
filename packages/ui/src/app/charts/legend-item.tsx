import type { ReactNode } from 'react'
import type { ViewModel } from '@protobase/schema'
import { filteredListAddress } from '../list-link'
import { AppLink } from '../use-app-address'

const row = 'flex items-center gap-2 rounded-md px-1 py-0.5'

/**
 * One row of a chart legend: a colour dot and the value's name, with `children` after it. With a `filter` the row links to
 * that value's records; without, as for the rest of a split, it is plain text.
 */
export const LegendItem = ({ resource, view, filter, color, label, children }: { resource: string; view: ViewModel | undefined; filter?: string; color: string; label: string; children?: ReactNode }) => {
  const content = (
    <>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate group-hover:text-primary-text">{label}</span>
      {children}
    </>
  )
  return (
    <li>
      {filter === undefined ? (
        <div className={row}>{content}</div>
      ) : (
        <AppLink to={filteredListAddress(view, resource, filter)} className={`group ${row} hover:bg-muted`}>
          {content}
        </AppLink>
      )}
    </li>
  )
}
