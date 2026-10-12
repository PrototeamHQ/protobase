import { Fragment, type ReactNode } from 'react'

export type ToolbarGroup = ReactNode[]

/** Whether a toolbar row with these groups and trailing control shows anything. */
export const toolbarShows = (groups: ToolbarGroup[], trailing?: ReactNode) => groups.some((group) => group.length > 0) || Boolean(trailing)

/**
 * One row of list controls: the non-empty groups in order with a divider between each two, then the trailing control
 * at the right end, narrowing before it wraps. Nothing at all when it would show nothing.
 */
export const ToolbarRow = ({ groups, trailing }: { groups: ToolbarGroup[]; trailing?: ReactNode }) => {
  if (!toolbarShows(groups, trailing)) return null
  const shown = groups.filter((group) => group.length > 0)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((group, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="mx-1 h-5 w-px bg-border" />}
          {group}
        </Fragment>
      ))}
      {trailing && <div className="flex min-w-32 flex-1 justify-end">{trailing}</div>}
    </div>
  )
}
