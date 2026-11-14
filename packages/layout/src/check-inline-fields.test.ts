import { describe, expect, it } from 'vitest'
import { Field, Link, Page, RecordCard } from './blocks'
import { pageProblems } from './check-page'
import { structureProblems } from './check-structure'
import { Details, Summary } from './details'
import { Text } from './elements'
import { BooleanField, ChipField, DateField, NumberField, TextField, UrlField } from './inline-fields'
import type { LayoutChildren } from './node'
import { models } from './testing/models'

const input = { models, actions: () => new Set<string>() }
const inInvoice = (children: LayoutChildren) => Page({ title: 'x', children: RecordCard({ resource: 'invoices', recordKey: '1', children }) })
const card = '<Page> › <RecordCard resource="invoices">'

describe('field components and Details', () => {
  it('take field components inline in a Text, a Link and a Summary', () => {
    const tree = inInvoice([
      Text({ children: ['Invoice ', TextField({ source: 'number' }), ' of ', DateField({ source: 'issuedOn', locales: 'nl-NL', options: { dateStyle: 'long' } }), ': ', NumberField({ source: 'total', options: { style: 'currency', currency: 'EUR' } }), ChipField({ source: 'status' })] }),
      Link({ to: { kind: 'record', resource: 'invoices', key: '{{id}}' }, children: TextField({ source: 'number' }) }),
      Details({ children: [Summary({ children: ['Memo ', TextField({ source: 'memo', emptyText: 'none' })] }), Text({ children: TextField({ source: 'memo' }) })] }),
    ])
    expect(structureProblems(tree)).toEqual([])
    expect(pageProblems({ name: 'x', title: 'x', tree }, input)).toEqual([])
  })

  it('fail on a source no record around them has, naming the closest field', () => {
    const tree = inInvoice(Text({ children: TextField({ source: 'numbr' }) }))
    expect(pageProblems({ name: 'x', title: 'x', tree }, input)).toEqual([`${card} › <Text> › <TextField source="numbr">: "numbr" is no field of invoices; did you mean number?`])
  })

  it('need a record around them', () => {
    expect(structureProblems(Page({ title: 'x', children: Text({ children: BooleanField({ source: 'paid' }) }) }))).toEqual([
      '<Page> › <Text> › <BooleanField source="paid">: needs a record: put it inside a RecordCard or a CardRow',
    ])
  })

  it('refuse a Field that still names its field by name', () => {
    expect(structureProblems(inInvoice(Field({ name: 'number' } as never)))).toEqual([
      `${card} › <Field name="number">: unknown prop "name"; it takes source, label, format, className`,
      `${card} › <Field name="number">: "source" is required`,
    ])
  })

  it('refuse a DateField that shows nothing, and options Intl does not take', () => {
    expect(structureProblems(inInvoice(DateField({ source: 'issuedOn', showDate: false })))).toEqual([`${card} › <DateField source="issuedOn">: cannot have showTime and showDate false at the same time`])
    expect(structureProblems(inInvoice(NumberField({ source: 'total', options: { style: 'currency' } })))).toEqual([
      `${card} › <NumberField source="total">: "locales" or "options" holds a locale or an option Intl does not take, or a value it does not take for one`,
    ])
    expect(structureProblems(inInvoice(DateField({ source: 'issuedOn', format: 'relative', showTime: true })))[0]).toMatch(/format="relative" takes no showDate/)
  })

  it('refuse a UrlField in a Link, which would be a link in a link', () => {
    const tree = inInvoice(Link({ href: 'https://example.com', children: UrlField({ source: 'memo' }) }))
    expect(structureProblems(tree)).toEqual([`${card} › <Link>: holds another link at <UrlField source="memo">; a link cannot contain a link`])
  })

  it('take one Summary as the first child of a Details, and a Summary nowhere else', () => {
    expect(structureProblems(Page({ title: 'x', children: Details({ children: Text({ children: 'Body' }) }) }))).toEqual(['<Page> › <Details>: takes one <Summary>, as its first child: the line shown while it is closed'])
    expect(structureProblems(Page({ title: 'x', children: Summary({ children: 'Alone' }) }))).toEqual(['<Page>: holds a <Summary>, which only a <Details> takes'])
    expect(structureProblems(Page({ title: 'x', children: Details({ children: Summary({ children: Text({ children: 'Block' }) }) }) }))).toEqual([
      '<Page> › <Details> › <Summary>: holds text, <Link>s, <Text as="span">s and field components such as <TextField> only',
    ])
  })
})
