import { useState } from 'react'
import { UserRoundCog } from 'lucide-react'
import { AuthError, type StaffSignIn } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { formatDateTime } from '../format'
import { Button } from '../primitives/button'

export type StaffBannerProps = {
  signIn: StaffSignIn
  /** Ends the staff session; the browser is signed out. */
  onStop: () => Promise<void>
}

/** Across the top of the app while staff are signed in as someone: who, as whom, why, until when, and a way to stop. */
export const StaffBanner = ({ signIn, onStop }: StaffBannerProps) => {
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string>()
  const stop = async () => {
    setStopping(true)
    setError(undefined)
    try {
      await onStop()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
      setStopping(false)
    }
  }
  return (
    <div role="region" aria-label="Staff session" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/40 bg-warning-soft px-4 py-2 text-[13px] text-warning-text">
      <UserRoundCog aria-hidden className="size-4 shrink-0" />
      <p className="min-w-64 flex-1 break-words">
        <span className="font-semibold">{signIn.staffName ?? signIn.staff}</span> is signed in as <span className="font-semibold">{signIn.user}</span> until{' '}
        {formatDateTime(Date.parse(signIn.expiresAt))}. Reason: {signIn.reason}
      </p>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
      <Button size="sm" loading={stopping} onClick={() => void stop()}>
        Stop staff session
      </Button>
    </div>
  )
}
