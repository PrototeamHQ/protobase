import { RotateCw } from 'lucide-react'
import { Button } from '../../primitives/button'
import { useAdminMeta } from '../meta-gate'
import { useRouter } from '../router'
import { text } from './messages'

/** The top bar's Reload page button, from the moment the page keeps its `/meta` for a new version until it reloads. */
export const NewVersionButton = () => {
  const changed = Boolean(useAdminMeta().versionChange)
  const { reload } = useRouter()
  if (!changed) return null
  return (
    <Button size="sm" variant="ghost" aria-label={text('reloadPageHint')} title={text('reloadPageHint')} onClick={reload} className="max-md:size-9 max-md:p-0">
      <RotateCw className="size-3.5 text-primary" />
      <span className="max-md:sr-only">{text('reloadPage')}</span>
    </Button>
  )
}
