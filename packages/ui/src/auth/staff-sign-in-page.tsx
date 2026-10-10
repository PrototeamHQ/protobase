import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { staffSignInMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { withoutStaffLink, type StaffLink } from './staff-link'
import { StaffSignInForm } from './staff-sign-in-form'

/** Starts a staff sign-in and leaves for the operator provider, which comes back to this page without the staff link. */
export const StaffSignInPage = ({ link, onBack }: { link: StaffLink; onBack: () => void }) => {
  const { session, staffSignIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(link.error && staffSignInMessage(link.error))

  const submit = async (email: string, reason: string) => {
    setBusy(true)
    setError(undefined)
    try {
      const callbackURL = `${window.location.origin}${withoutStaffLink(window.location.href)}`
      window.location.assign(await session.staff.start({ email, reason, callbackURL }))
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(staffSignInMessage(failure))
      setBusy(false)
    }
  }

  return <StaffSignInForm operator={staffSignIn} email={link.email} reason={link.reason} busy={busy} error={error} onBack={onBack} onSubmit={(email, reason) => void submit(email, reason)} />
}
