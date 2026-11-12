import { describe, expect, it } from 'vitest'
import pdfViewer, { PdfViewer } from './index'

describe('the PDF viewer plugin', () => {
  it('opens PDF files and no other type', () => {
    expect(pdfViewer.name).toBe('pdf-viewer')
    expect(pdfViewer.fileViewers).toEqual({ 'application/pdf': { component: PdfViewer } })
  })
})
