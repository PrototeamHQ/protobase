import { describe, expect, it } from 'vitest'
import { clientName, clientNameLength } from './client-name'

describe("a client's name as the page shows it", () => {
  it('is one line of plain text', () => {
    expect(clientName('Example\nEditor')).toBe('Example Editor')
    expect(clientName('<b>Assistant</b>')).toBe('<b>Assistant</b>')
  })

  it('loses characters that hide or turn text around', () => {
    expect(clientName('Cl\u200baude')).toBe('Cl aude')
    expect(clientName('evil\u202Eia.edualc')).toBe('evil ia.edualc')
    expect(clientName('\u2066Example Assistant\u2069')).toBe('Example Assistant')
  })

  it('is cut when long, and nothing when empty', () => {
    const long = clientName('x'.repeat(5000))!
    expect(long).toHaveLength(clientNameLength)
    expect(long.endsWith('…')).toBe(true)
    expect(clientName('  \u200b ')).toBeUndefined()
    expect(clientName(undefined)).toBeUndefined()
  })
})
