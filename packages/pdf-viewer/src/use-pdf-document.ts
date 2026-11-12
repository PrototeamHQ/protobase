import { useEffect, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PdfAssets } from './pdf-assets'

type Loaded = { document: PDFDocumentProxy } | { error: unknown }

/**
 * The PDF at `url`, read by pdf.js in its worker, or the error reading it gave; `undefined` while it loads. The
 * document is let go when the viewer closes or the address changes.
 */
export const usePdfDocument = (url: string) => {
  const [loaded, setLoaded] = useState<Loaded>()
  useEffect(() => {
    GlobalWorkerOptions.workerSrc = workerUrl
    const task = getDocument({ url, BinaryDataFactory: PdfAssets })
    let current = true
    task.promise.then(
      (document) => current && setLoaded({ document }),
      (error: unknown) => current && setLoaded({ error }),
    )
    return () => {
      current = false
      setLoaded(undefined)
      void task.destroy()
    }
  }, [url])
  return loaded
}
