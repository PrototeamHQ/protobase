import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { RenderingCancelledException, type PDFDocumentProxy } from 'pdfjs-dist'
import { pageSize } from './page-size'
import { text } from './texts'
import { useNearScreen } from './use-near-screen'

// A page's shape until pdf.js has read it: A4, the most common one.
const a4Ratio = 297 / 210

// Inline styles, as this package's own utility classes are not built into the app (see pdf-view.tsx).
const sheet: CSSProperties = { display: 'block', background: 'white', boxShadow: '0 1px 3px rgb(0 0 0 / 0.2)' }

type PdfPageProps = { document: PDFDocumentProxy; number: number; width: number }

/**
 * Page `number` of `document`, `width` CSS pixels wide: drawn while it is near the screen, and drawn again when the width
 * changes. A page that moves away lets its canvas's pixels go and keeps its height, so a long PDF holds only the pages
 * around the screen. A page pdf.js cannot draw throws.
 */
export const PdfPage = ({ document, number, width }: PdfPageProps) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const near = useNearScreen(canvas)
  const [height, setHeight] = useState(width * a4Ratio)
  const [error, setError] = useState<unknown>()
  useEffect(() => {
    if (!near || !canvas.current) return
    const target = canvas.current
    let render: { cancel: () => void } | undefined
    let current = true
    const draw = async () => {
      const page = await document.getPage(number)
      if (!current) return
      const shape = page.getViewport({ scale: 1 })
      const size = pageSize(shape.width, shape.height, width, window.devicePixelRatio)
      target.width = size.canvasWidth
      target.height = size.canvasHeight
      setHeight(size.cssHeight)
      const task = page.render({ canvas: target, viewport: page.getViewport({ scale: size.scale * size.pixelRatio }) })
      render = task
      await task.promise
    }
    draw().catch((reason: unknown) => {
      if (reason instanceof RenderingCancelledException) return
      setError(reason)
    })
    return () => {
      current = false
      render?.cancel()
      // A canvas of no pixels holds no memory; its CSS size keeps the page's place.
      target.width = 0
      target.height = 0
    }
  }, [document, number, width, near])
  if (error) throw error
  return <canvas ref={canvas} role="img" aria-label={text().page(number, document.numPages)} style={{ ...sheet, width, height }} />
}
