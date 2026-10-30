import type { ReactNode } from 'react'
import { Badge, type BadgeTone } from '../primitives/badge'
import { AvatarStack } from '../primitives/avatar'
import { text } from './messages'

export type RecordHeaderProps = {
  /** A line above the title naming the collection; the record page leaves it to the breadcrumb. */
  collection?: string
  title: string
  /** The badge beside the title; without it there is none. */
  status?: { label: string; tone: BadgeTone }
  /** A line under the title; without a name it reads "Last updated ...". The record page leaves it to its sidebar. */
  lastEditedBy?: { name?: string; ago: string }
  presence?: Array<{ initials: string; hue: number }>
  actions?: ReactNode
}

export const RecordHeader = ({ collection, title, status, lastEditedBy, presence = [], actions }: RecordHeaderProps) => {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between md:gap-6">
      <div>
        {collection && <p className="mb-1 text-xs text-muted-foreground">{collection}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
        </div>
        {lastEditedBy && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {lastEditedBy.name ? (
              <>
                {text('lastEditedBy')} <span className="font-medium text-foreground">{lastEditedBy.name}</span> {lastEditedBy.ago}
              </>
            ) : (
              <>{text('lastUpdated', { ago: lastEditedBy.ago })}</>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {presence.length > 0 && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <AvatarStack people={presence} size="md" />
            {text('viewing', { count: presence.length })}
          </span>
        )}
        {actions}
      </div>
    </header>
  )
}
