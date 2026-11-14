import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FieldModel, FieldViewModel, ResourceModel, ViewModel } from '@protobase/schema'
import { linkTextOf } from '../live/link-text'
import { FieldEditor, showsValue } from './field-editor'

const shown = (field: FieldModel, stored: unknown, hints?: FieldViewModel, locked = false) =>
  renderToStaticMarkup(<FieldEditor field={field} hints={hints} value="" stored={stored} locked={locked} onChange={() => {}} />)

const base = { column: '', filterable: false, sortable: false, aliases: [], nullable: true, readOnly: true }
const verdict: FieldModel = { ...base, name: 'verdict', type: 'enum', enumValues: ['moving', 'stuck'] }

describe('a field nobody may change on the form', () => {
  it('shows an enum as a badge in its value colour and label, not a greyed input', () => {
    const html = shown(verdict, 'stuck', { valueLabels: { stuck: 'Stuck' }, valueColors: { stuck: '#dc2626' } })
    expect(html).toContain('background-color:#dc2626')
    expect(html).toContain('>Stuck</span>')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('text-muted-foreground')
  })

  it('shows a badge in its tone on a locked form', () => {
    const status: FieldModel = { ...verdict, readOnly: false }
    expect(shown(status, 'moving', { valueColors: { moving: 'green' } }, true)).toContain('bg-success-soft')
  })

  it('shows a timestamp relative when the view says, its exact time on hover', () => {
    const at: FieldModel = { ...base, name: 'last_sign_at', type: 'timestamp' }
    const html = shown(at, new Date(Date.now() - 3 * 3600_000).toISOString(), { format: 'relative' })
    expect(html).toMatch(/<time datetime="[^"]+" title="[^"]*\d[^"]*">3 hours ago<\/time>/i)
  })

  it('shows text at full contrast, and an empty value as a faint dash', () => {
    const note: FieldModel = { ...base, name: 'headline', type: 'text' }
    const html = shown(note, 'Waiting on review')
    expect(html).toContain('text-foreground')
    expect(html).not.toContain('text-muted-foreground')
    expect(shown(note, null)).toContain('<span aria-hidden="true">—</span><span class="sr-only">No value</span>')
  })

  it('shows a relation with no value as the dash a screen reader reads as no value', () => {
    const owner: FieldModel = { ...base, name: 'owner', type: 'relation' }
    expect(shown(owner, null)).toContain('<span aria-hidden="true">—</span><span class="sr-only">No value</span>')
  })

  it('shows a boolean as yes or no, not a switch', () => {
    const flag: FieldModel = { ...base, name: 'running', type: 'boolean', nullable: false }
    const html = shown(flag, true)
    expect(html).not.toContain('role="switch"')
    expect(html).toContain('Yes')
  })

  it("shows a locked url field's link text, fixed or from the record, and its address without one", () => {
    const report: FieldModel = { ...base, name: 'report', type: 'text', readOnly: false }
    const title: FieldModel = { ...base, name: 'title', type: 'text' }
    const model = { name: 'errors', fields: { report, title } } as unknown as ResourceModel
    const record = { report: 'https://example.com/1', title: 'Crash on save' }
    const locked = (linkText?: string) => {
      const view = { resource: 'errors', fields: { report: { format: 'url', ...(linkText !== undefined && { linkText }) } } } as unknown as ViewModel
      const text = linkTextOf(model, view, 'report', record)
      return renderToStaticMarkup(<FieldEditor field={report} hints={view.fields.report} value="" stored={record.report} locked linkText={text} onChange={() => {}} />)
    }
    expect(locked('Error report')).toMatch(/<a href="https:\/\/example.com\/1"[^>]*>Error report<\/a>/)
    expect(locked('{{title}}')).toMatch(/>Crash on save<\/a>/)
    expect(locked()).toMatch(/>https:\/\/example.com\/1<\/a>/)
  })
})

describe('whether a form shows a field as a value', () => {
  const owner: FieldModel = { ...base, name: 'owner', type: 'relation', readOnly: false }

  it('keeps a relation the user may pick as a control', () => {
    expect(showsValue(owner, undefined, false, true)).toBe(false)
  })

  it('shows a relation with no picker, a read-only one, or one on a locked form as a value', () => {
    expect(showsValue(owner, undefined, false, false)).toBe(true)
    expect(showsValue({ ...owner, readOnly: true }, undefined, false, true)).toBe(true)
    expect(showsValue(owner, undefined, true, true)).toBe(true)
  })

  it('keeps a sensitive or file field its own control', () => {
    expect(showsValue({ ...base, name: 'token', type: 'text', sensitive: true }, undefined, true, false)).toBe(false)
    expect(showsValue({ ...base, name: 'photo', type: 'file' }, undefined, true, false)).toBe(false)
  })
})
