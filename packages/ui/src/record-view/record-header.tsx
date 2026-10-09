import type { ReactNode } from 'react'
import { Badge, type BadgeTone } from '../primitives/badge'
import { AvatarStack } from '../primitives/avatar'

export type RecordHeaderProps = {
  collection: string
  title: string
  status: { label: string; tone: BadgeTone }
  /** Without a name the line reads "Last updated ...". */
  lastEditedBy: { name?: string; ago: string }
  presence?: Array<{ initials: string; hue: number }>
  actions?: ReactNode
}

export const RecordHeader = ({ collection, title, status, lastEditedBy, presence = [], actions }: RecordHeaderProps) => (
  <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between md:gap-6">
    <div>
      <p className="text-xs text-muted-foreground">{collection}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {lastEditedBy.name ? (
          <>
            Last edited by <span className="font-medium text-foreground">{lastEditedBy.name}</span> {lastEditedBy.ago}
          </>
        ) : (
          <>Last updated {lastEditedBy.ago}</>
        )}
      </p>
    </div>
    <div className="flex items-center gap-4">
      {presence.length > 0 && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <AvatarStack people={presence} size="md" />
          {presence.length} viewing
        </span>
      )}
      {actions}
    </div>
  </header>
)
