import { useState } from 'react'
import { useAuth } from '../auth/auth-provider'
import { useAction } from './use-action'

/** Joins one of the person's invitations at a time, then `onJoined`; `joining` is the invitation it is joining. */
export const useJoinInvitation = (onJoined: () => void) => {
  const { session } = useAuth()
  const { busy, error, run } = useAction()
  const [pressed, setPressed] = useState<string>()
  const join = (invitationId: string) => {
    setPressed(invitationId)
    void run(async () => {
      await session.organizations.acceptMine(invitationId)
      onJoined()
    })
  }
  return { busy, error, joining: busy ? pressed : undefined, join }
}
