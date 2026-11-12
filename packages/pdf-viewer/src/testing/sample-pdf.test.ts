import { describe, expect, it } from 'vitest'
import { samplePdf } from './sample-pdf'

describe('the sample PDF', () => {
  it('points its cross-reference table at each object it holds', () => {
    const pdf = atob(samplePdf(['One', 'Two']).replace('data:application/pdf;base64,', ''))
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map(([, offset]) => Number(offset))
    expect(offsets).toHaveLength(7)
    offsets.forEach((offset, index) => expect(pdf.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj\\n`)))
    expect(pdf.slice(Number(/startxref\n(\d+)/.exec(pdf)![1]))).toMatch(/^xref\n/)
  })
})
