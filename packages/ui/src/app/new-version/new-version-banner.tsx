import { RotateCw } from 'lucide-react'
import { slotted } from '../../locale/slotted'
import { useAdminMeta } from '../meta-gate'
import { useRouter } from '../router'
import { text } from './messages'

/**
 * Across the bottom of a full-width sidebar, from the moment the page keeps its `/meta` for a new version until it
 * reloads: the app's name, that it was updated, and a click that reloads, asking first while a guard holds unsaved
 * changes. It stands in for `NewVersionToast` and `NewVersionButton`, which float over the page.
 */
export const NewVersionBanner = () => {
  const { versionChange, appName } = useAdminMeta()
  const { reload } = useRouter()
  if (!versionChange) return null
  return (
    <button
      type="button"
      onClick={reload}
      className="flex w-full shrink-0 items-start gap-2 border-t border-warning/40 bg-warning-soft px-3.5 py-2 text-left text-warning-text transition-colors hover:bg-warning/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <RotateCw aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words font-semibold">{appName ? slotted(text('bannerTitle'), appName) : text('title')}</span>
        <span className="text-xs">{text('bannerLine')}</span>
      </span>
    </button>
  )
}
