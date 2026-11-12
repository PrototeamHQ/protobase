import { useRef, type CSSProperties } from 'react'
import { Spinner, type FileViewerProps } from '@protobase/ui'
import { PdfPage } from './pdf-page'
import { useElementWidth } from './use-element-width'
import { usePdfDocument } from './use-pdf-document'

// Inline styles rather than Tailwind classes: an app's build makes utilities only for its own files, not for this
// package's in node_modules. The pages sit one under the other on the page, which scrolls as it does for any record.
const pages: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--muted)' }
const column: CSSProperties = { width: '100%', maxWidth: '60rem' }

/** A PDF's pages one under the other, as wide as the page allows; a file pdf.js cannot read throws. */
export const PdfView = ({ file }: FileViewerProps) => {
  const loaded = usePdfDocument(file.url)
  const measured = useRef<HTMLDivElement>(null)
  const width = useElementWidth(measured)
  if (loaded && 'error' in loaded) throw loaded.error
  return (
    <div style={pages}>
      <div ref={measured} style={column} />
      {loaded && width !== undefined ? (
        Array.from({ length: loaded.document.numPages }, (_, index) => <PdfPage key={index} document={loaded.document} number={index + 1} width={width} />)
      ) : (
        <Spinner />
      )}
    </div>
  )
}
