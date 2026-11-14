import { lazy, Suspense } from 'react'
import type { ProjectUi } from '../pages/project-ui'
import { viewerFor, type FileViewer, type FileViewerProps } from './file-viewer'
import { PageSkeleton } from './page-skeleton'

// The viewer's code is a chunk of its own, which the app loads only when an HTML file opens.
const HtmlViewer = lazy(() => import('./html-viewer').then((module) => ({ default: module.HtmlViewer })))

const LazyHtmlViewer = (props: FileViewerProps) => (
  <Suspense fallback={<PageSkeleton name={props.file.name} />}>
    <HtmlViewer {...props} />
  </Suspense>
)

/** The viewers Protobase brings itself: HTML files, in a sandboxed frame. */
const builtInViewers: Readonly<Record<string, FileViewer>> = { 'text/html': { component: LazyHtmlViewer } }

/** The viewer for a file's media type: the one the app or a plugin registers, else Protobase's own, if any. */
export const fileViewerFor = (ui: ProjectUi, type: string) => viewerFor(ui.fileViewers, type) ?? viewerFor(builtInViewers, type)
