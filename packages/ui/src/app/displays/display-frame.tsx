import type { ReactNode } from 'react'
import { Button } from '../../primitives/button'
import { ErrorBanner } from '../error-banner'
import type { ListDisplay } from './display-context'
import { formatTag } from '../../locale/active-locale'
import { text } from './messages'

/** A display's scrolling area: while loading, on an error or with no rows it says so instead of drawing them. */
export const DisplayState = ({ list, empty, loading, children }: { list: ListDisplay; empty: string; loading: ReactNode; children: ReactNode }) => (
  <div className="min-h-0 flex-1 overflow-y-auto">
    {list.loading ? loading : list.error ? <ErrorBanner title={text('couldNotLoadRows')} error={list.error} /> : list.rows.length === 0 ? <p className="py-8 text-center text-muted-foreground">{empty}</p> : children}
  </div>
)

/** How many of the matching records are shown, and a button for the next page while there is one. */
export const DisplayFooter = ({ list }: { list: ListDisplay }) => (
  <div className="flex items-center justify-between gap-3 py-3 text-xs text-muted-foreground">
    <span>
      {list.rows.length.toLocaleString(formatTag())} of {list.total.toLocaleString(formatTag())}
    </span>
    {list.more && (
      <Button size="sm" onClick={list.loadMore}>
        {text('showMore')}
      </Button>
    )}
  </div>
)
