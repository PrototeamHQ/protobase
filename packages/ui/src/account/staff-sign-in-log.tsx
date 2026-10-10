import type { StaffSignIn } from '@protobase/client'
import { formatDateTime } from '../format'
import { Badge } from '../primitives/badge'
import { AccountSection, SectionError } from './account-section'

export type StaffSignInLogProps = {
  /** Newest first; `undefined` while loading. */
  signIns?: StaffSignIn[]
  /** The operator provider's name, for the description. */
  operator: string
  error?: string
  /** Now in milliseconds, to tell running sessions from expired ones; stories pin it. */
  now?: number
}

const stateOf = (entry: StaffSignIn, now: number) =>
  entry.endedAt ? (
    <Badge tone="neutral">Stopped {formatDateTime(Date.parse(entry.endedAt))}</Badge>
  ) : Date.parse(entry.expiresAt) <= now ? (
    <Badge tone="neutral">Ended {formatDateTime(Date.parse(entry.expiresAt))}</Badge>
  ) : (
    <Badge tone="amber">Signed in until {formatDateTime(Date.parse(entry.expiresAt))}</Badge>
  )

/** The app's log of staff sign-ins, for admins: who signed in as whom, why, and when. */
export const StaffSignInLog = ({ signIns, operator, error, now = Date.now() }: StaffSignInLogProps) => (
  <AccountSection title="Staff sign-ins" description={`Each time staff of ${operator} signed in as someone here, newest first.`}>
    <SectionError message={error} />
    {signIns && signIns.length === 0 && <p className="text-[13px] text-muted-foreground">No staff has signed in as anyone yet.</p>}
    {signIns && signIns.length > 0 && (
      <ul className="divide-y rounded-md border">
        {signIns.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-1.5 p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span className="font-medium break-all">{entry.staffName ? `${entry.staffName} (${entry.staff})` : entry.staff}</span>
              <span className="text-muted-foreground">as</span>
              <span className="font-medium break-all">{entry.user}</span>
            </div>
            <p className="text-[13px] break-words">{entry.reason}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatDateTime(Date.parse(entry.startedAt))}</span>
              {stateOf(entry, now)}
            </div>
          </li>
        ))}
      </ul>
    )}
  </AccountSection>
)
