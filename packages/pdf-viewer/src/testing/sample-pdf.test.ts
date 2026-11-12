import { describe, expect, it } from 'vitest'
import { jpxPdf, samplePdf } from './sample-pdf'

describe('the sample PDFs', () => {
  it.each([
    ['text pages', samplePdf(['One', 'Two']), 7],
    ['scanned page', jpxPdf(), 5],
  ])('of %s points its cross-reference table at each object it holds', (_, url, objects) => {
    const pdf = atob(url.replace('data:application/pdf;base64,', ''))
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map(([, offset]) => Number(offset))
    expect(offsets).toHaveLength(objects)
    offsets.forEach((offset, index) => expect(pdf.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj\\n`)))
    expect(pdf.slice(Number(/startxref\n(\d+)/.exec(pdf)![1]))).toMatch(/^xref\n/)
  })
})
