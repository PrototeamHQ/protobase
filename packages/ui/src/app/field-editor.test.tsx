import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { FieldEditor } from './field-editor'

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
    expect(html).toMatch(/>3 hours ago<\/span>/)
    expect(html).toMatch(/title="[^"]*\d/)
  })

  it('shows text at full contrast, and an empty value as a faint dash', () => {
    const note: FieldModel = { ...base, name: 'headline', type: 'text' }
    const html = shown(note, 'Waiting on review')
    expect(html).toContain('text-foreground')
    expect(html).not.toContain('text-muted-foreground')
    expect(shown(note, null)).toContain('<span class="text-muted-foreground">—</span>')
  })

  it('shows a boolean as yes or no, not a switch', () => {
    const flag: FieldModel = { ...base, name: 'running', type: 'boolean', nullable: false }
    const html = shown(flag, true)
    expect(html).not.toContain('role="switch"')
    expect(html).toContain('Yes')
  })
})
