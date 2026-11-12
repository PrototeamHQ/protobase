import { lazy, Suspense } from 'react'
import { Spinner, type FileViewerProps } from '@protobase/ui'

// The viewer's code, pdf.js with it, is a module of its own, which the app loads only when a PDF opens.
const PdfView = lazy(() => import('./pdf-view').then((module) => ({ default: module.PdfView })))

// Padded inline, as this package's own utility classes are not built into the app (see pdf-view.tsx).
const Loading = () => (
  <div style={{ padding: '1rem' }}>
    <Spinner />
  </div>
)

/** The PDF viewer: loads its code when a PDF opens, with a spinner meanwhile. */
export const PdfViewer = (props: FileViewerProps) => (
  <Suspense fallback={<Loading />}>
    <PdfView {...props} />
  </Suspense>
)
