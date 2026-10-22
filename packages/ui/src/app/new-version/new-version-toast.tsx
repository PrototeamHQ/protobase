import { useEffect } from 'react'
import { useMeta } from '../data/use-meta'
import { useToast } from '../toasts'
import { text } from './new-version-notice-messages'
import { useRouter } from './router'

/**
 * Once the server runs another Protobase version than the page started with, a toast that says so and reloads the
 * page, asking first when a form holds unsaved changes. It stays until dismissed; the page keeps the `/meta` it started
 * with meanwhile (see `keepOnVersionChange`).
 */
export const NewVersionNotice = () => {
  const change = useMeta().data?.versionChange
  const toast = useToast()
  const { reload } = useRouter()
  const shown = Boolean(change)
  const version = change?.to
  useEffect(() => {
    if (!shown) return
    const id = toast.show({ state: 'warning', sticky: true, title: text('title'), description: text('description', version), action: { label: text('reload'), onClick: reload } })
    return () => toast.dismiss(id)
  }, [shown, version, toast, reload])
  return null
}
