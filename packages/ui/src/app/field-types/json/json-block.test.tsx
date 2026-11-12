import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { JsonBlock } from './json-block'

const keys = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`key_${i}`, i]))

describe('a JSON block', () => {
  it('shows a long value’s first 20 lines with a button that names all its lines', () => {
    const html = renderToStaticMarkup(<JsonBlock value={keys(60)} />)
    expect(html).toContain('&quot;key_18&quot;')
    expect(html).not.toContain('&quot;key_19&quot;')
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Show all 62 lines<\/button>/)
  })

  it('shows a short value whole, with no button', () => {
    const html = renderToStaticMarkup(<JsonBlock value={keys(18)} />)
    expect(html).toContain('&quot;key_17&quot;')
    expect(html).not.toContain('<button')
  })
})
