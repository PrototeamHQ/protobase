import { createElement as h } from 'react'
import { describe, expect, it } from 'vitest'
import { pdfText } from '../../../../test-support/pdf-text'
import { Document, Page, StyleSheet, Text, View } from '../pdf'
import { definePdf } from './define-pdf'

type Quote = { client: string; lines: { item: string; price: string }[] }

const styles = StyleSheet.create({ page: { padding: 40 }, line: { flexDirection: 'row', justifyContent: 'space-between' } })

const QuoteDocument = ({ client, lines }: Quote) =>
  h(
    Document,
    { title: `Quote for ${client}` },
    h(Page, { size: 'A4', style: styles.page }, h(Text, null, `Quote for ${client}`), ...lines.map(({ item, price }) => h(View, { key: item, style: styles.line }, h(Text, null, item), h(Text, null, price)))),
  )

const quote = definePdf({ name: 'quote', component: QuoteDocument })

describe('definePdf', () => {
  it('renders the document for its data to the bytes of a PDF file', async () => {
    const bytes = await quote.render({ client: 'Ada', lines: [{ item: 'New chain', price: '€ 24.50' }] })
    expect(bytes.constructor).toBe(Uint8Array)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    // The standard fonts write the euro sign as its Windows-1252 code, 0x80.
    expect(pdfText(bytes)).toBe('Quote for AdaNew chain\x80 24.50')
  })

  it('carries its name', () => {
    expect(quote.name).toBe('quote')
  })
})
