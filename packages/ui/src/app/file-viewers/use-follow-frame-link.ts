import { useCallback } from 'react'
import { useProjectUi } from '../pages/project-ui'
import { useAppAddress } from '../use-app-address'
import { fileViewerFor } from './built-in-viewers'
import type { SiblingFile } from './file-viewer'
import type { FrameLink } from './sibling-page'
import { useViewedResource } from './viewed-resource'

const openTab = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

/**
 * Follows a link of a sibling page in a file viewer: a sibling with a viewer opens on its record's address with
 * `?file=<field>`, in this tab or a new one; any other sibling downloads in a new tab, as its file link does; an outside
 * address opens in a new tab that cannot reach back to the app.
 */
export const useFollowFrameLink = () => {
  const ui = useProjectUi()
  const resource = useViewedResource()
  const { go, href } = useAppAddress()
  return useCallback(
    (link: FrameLink<SiblingFile>, { newTab }: { newTab: boolean }) => {
      if (link.kind === 'external') {
        openTab(link.url)
        return
      }
      const { file } = link
      if (!fileViewerFor(ui, file.type)) {
        openTab(file.url)
        return
      }
      const to = { kind: 'record', resource, key: file.key, file: file.field } as const
      if (newTab) {
        openTab(href(to))
        return
      }
      go(to)
    },
    [ui, resource, go, href],
  )
}
