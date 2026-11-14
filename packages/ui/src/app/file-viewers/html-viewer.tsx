import { PageSkeleton } from './page-skeleton'
import type { FileViewerProps } from './file-viewer'
import { HtmlFrame } from './html-frame'
import { useFileText } from './use-file-text'
import { useFollowFrameLink } from './use-follow-frame-link'
import { useSiblingPage } from './use-sibling-page'

/**
 * Protobase's viewer for HTML files: the page in an `HtmlFrame` that runs none of its scripts, with its images, videos
 * and links resolved to its siblings. A file it cannot read throws, so the viewer page offers the download instead.
 */
export const HtmlViewer = ({ file, siblings }: FileViewerProps) => {
  const read = useFileText(file)
  const page = useSiblingPage(read.data, siblings)
  const follow = useFollowFrameLink()
  if (read.error) throw read.error
  if (!page) return <PageSkeleton />
  return <HtmlFrame html={page.html} title={file.name} links={page.links} onLink={follow} />
}
