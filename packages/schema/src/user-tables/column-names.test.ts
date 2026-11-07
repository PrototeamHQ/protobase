import { describe, expect, it } from 'vitest'
import { fieldNamesOf, tableNameOf } from './column-names'

describe('fieldNamesOf', () => {
  it('names each column in snake_case from its header', () => {
    expect(fieldNamesOf(['Customer email', 'Prijs (€)', 'Café', '2026 total'])).toEqual(['customer_email', 'prijs', 'cafe', 'column_2026_total'])
  })

  it('never gives two headers one name', () => {
    expect(fieldNamesOf(['Name', 'name', 'NAME!'])).toEqual(['name', 'name_2', 'name_3'])
  })

  it('moves off the names every table has and the words SQL reserves', () => {
    expect(fieldNamesOf(['ID', 'etag', 'Order', 'id_2'])).toEqual(['id_2', 'etag_2', 'order_2', 'id_2_2'])
  })

  it('names a column without a header by its letters', () => {
    expect(fieldNamesOf(['', '---', 'x'])).toEqual(['column_a', 'column_b', 'x'])
  })

  it('keeps a name within 63 bytes', () => {
    const [first, second] = fieldNamesOf(['a'.repeat(80), 'a'.repeat(70)])
    expect(first).toBe('a'.repeat(63))
    expect(second).toBe(`${'a'.repeat(61)}_2`)
  })
})

describe('tableNameOf', () => {
  it('names the table after the file without its extension', () => {
    expect(tableNameOf('Trade fair 2026.xlsx')).toBe('trade_fair_2026')
    expect(tableNameOf('2026 leads.csv')).toBe('table_2026_leads')
    expect(tableNameOf('contacts.json', ['contacts', 'contacts_2'])).toBe('contacts_3')
    expect(tableNameOf('select.csv')).toBe('select_2')
    expect(tableNameOf('….csv')).toBeUndefined()
    expect(tableNameOf(`${'b'.repeat(50)}.csv`, [], 42)).toBe('b'.repeat(42))
  })
})
