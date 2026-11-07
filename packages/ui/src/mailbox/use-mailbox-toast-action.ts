import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useOptionalAuth } from '../auth/auth-provider'
import { useToast, type ToastAction } from '../toasts'
import { mailboxProblem } from './mailbox-problem'
import { text } from './messages'

/**
 * For the toast of a failure: a button that connects the mailbox when the failure was for want of one, or as its link
 * expired, starting the same sign-in as the account page's, which comes back to this page. None for any other failure,
 * or when the app has no mailbox the failure points at.
 */
export const useMailboxToastAction = () => {
  const auth = useOptionalAuth()
  const toast = useToast()
  return (error: unknown): ToastAction | undefined => {
    const problem = mailboxProblem(error)
    const links = auth?.personalMail ?? []
    if (!auth || !problem) return
    const link = links.find((entry) => entry.id === problem.provider) ?? (links.length === 1 ? links[0] : undefined)
    if (!link) return
    const connect = async () => {
      try {
        await auth.linkPersonalMail(link)
      } catch (failure) {
        if (!(failure instanceof AuthError)) throw failure
        toast.show({ state: 'error', title: text('connect', { name: link.name }), description: authMessage(failure) })
      }
    }
    return { label: text(problem.code === 'link_expired' ? 'connectAgain' : 'connect', { name: link.name }), onClick: () => void connect() }
  }
}
