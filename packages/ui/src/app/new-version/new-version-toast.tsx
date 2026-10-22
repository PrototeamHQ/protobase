import { useEffect, useState } from 'react'
import { useToast } from '../../toasts'
import { useAdminMeta } from '../meta-gate'
import { useRouter } from '../router'
import { text } from './messages'
import { useModalOpen } from './use-modal-open'

/**
 * Once the server runs another Protobase version than the page started with, a toast that says so and reloads the
 * page, asking first while a guard holds unsaved changes. It stays until Reload or ×, and after × it does not come
 * back; the top bar's `NewVersionButton` stays. It steps aside while a modal is open, whose buttons it could cover on a
 * phone. The page keeps the `/meta` it has meanwhile (see `keepOnVersionChange`).
 */
export const NewVersionToast = () => {
  const changed = Boolean(useAdminMeta().versionChange)
  const modalOpen = useModalOpen()
  const [closed, setClosed] = useState(false)
  const toast = useToast()
  const { reload } = useRouter()
  const shown = changed && !closed && !modalOpen
  useEffect(() => {
    if (!shown) return
    const id = toast.show({ state: 'info', sticky: true, title: text('title'), description: text('description'), action: { label: text('reload'), onClick: reload }, onClose: () => setClosed(true) })
    return () => toast.dismiss(id)
  }, [shown, toast, reload])
  return null
}
