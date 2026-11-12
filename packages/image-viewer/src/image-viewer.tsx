import { lazy, Suspense } from 'react'
import { Spinner, type FileViewerProps } from '@protobase/ui'

// The viewer's code is a module of its own, which the app loads only when an image opens.
const ImageView = lazy(() => import('./image-view').then((module) => ({ default: module.ImageView })))

// Padded inline, as this package's own utility classes are not built into the app (see image-view.tsx).
const Loading = () => (
  <div style={{ padding: '1rem' }}>
    <Spinner />
  </div>
)

/** The image viewer: loads its code when an image opens, with a spinner meanwhile. */
export const ImageViewer = (props: FileViewerProps) => (
  <Suspense fallback={<Loading />}>
    <ImageView {...props} />
  </Suspense>
)
