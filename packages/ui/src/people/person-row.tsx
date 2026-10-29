import type { ReactNode } from 'react'
import { SectionError } from '../account/account-section'

export type PersonRowProps = {
  name: string
  email: string
  /** The row is the signed-in person's own. */
  self: boolean
  /** On the line of the name, such as a role to choose or Remove. */
  actions?: ReactNode
  /** The lines under it, such as the roles held. */
  children?: ReactNode
  /** Why the last change to this person did not go through. */
  error?: string
  /** Beside the name, such as their status (see `StatusMark`). */
  status?: ReactNode
}

/** Someone in a list of people: their name, " (you)" on one's own row, their address, what can be done and their roles. */
export const PersonRow = ({ name, email, self, actions, children, error, status }: PersonRowProps) => (
  <li className="flex flex-col gap-2 px-3 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1">
        {status ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{name}{self && ' (you)'}</span>
            {status}
          </span>
        ) : (
          <span className="block truncate font-medium">{name}{self && ' (you)'}</span>
        )}
        <span className="block truncate text-xs text-muted-foreground">{email}</span>
      </span>
      {actions}
    </div>
    {children}
    <SectionError message={error} />
  </li>
)
