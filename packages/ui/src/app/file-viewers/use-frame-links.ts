import { useCallback } from 'react'
import { useAppAddress } from '../use-app-address'
import type { SiblingFile } from './file-viewer'
import type { FrameLink } from './sibling-page'
import { useViewedResource } from './viewed-resource'

const openTab = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

/**
 * The links of a sibling page in a file viewer. A sibling opens on its record's address with `?file=<field>`, which its
 * link shows, in this tab or a new one: in its viewer, or beside its download when it has none. An outside address
 * opens in a new tab that cannot reach back to the app.
 */
export const useFrameLinks = () => {
  const resource = useViewedResource()
  const { go, href } = useAppAddress()

  const fileAddress = useCallback((file: SiblingFile) => ({ kind: 'record', resource, key: file.key, file: file.field }) as const, [resource])

  const address = useCallback(
    (link: FrameLink<SiblingFile>) => (link.kind === 'external' ? link.url : new URL(href(fileAddress(link.file)), window.location.href).href),
    [fileAddress, href],
  )

  const follow = useCallback(
    (link: FrameLink<SiblingFile>, { newTab }: { newTab: boolean }) => {
      if (link.kind === 'external') {
        openTab(link.url)
        return
      }
      const to = fileAddress(link.file)
      if (newTab) {
        openTab(href(to))
        return
      }
      go(to)
    },
    [fileAddress, go, href],
  )

  return { address, follow }
}
