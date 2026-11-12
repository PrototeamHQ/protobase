import { definePlugin } from '@protobase/ui'
import { PdfViewer } from './pdf-viewer'

export { PdfViewer } from './pdf-viewer'

/**
 * The PDF viewer plugin: an app attaches it with `defineUi({ extends: [pdfViewer] })` in its `protobase.ui.tsx`, and a
 * stored PDF then opens in the app, page by page, instead of downloading.
 */
export default definePlugin({ name: 'pdf-viewer', fileViewers: { 'application/pdf': { component: PdfViewer } } })
