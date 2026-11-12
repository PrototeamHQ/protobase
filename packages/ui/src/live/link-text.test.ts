import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { linkTextOf } from './link-text'

const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}): FieldModel =>
  ({ name, column: name, type, nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel

const model = {
  name: 'errors',
  fields: { report: field('report', 'text'), title: field('title', 'text'), level: field('level', 'enum', { enumValues: ['fatal'] }), project: field('project', 'relation') },
} as unknown as ResourceModel

const viewWith = (linkText?: string) => ({ resource: 'errors', fields: { report: { format: 'url', ...(linkText !== undefined && { linkText }) }, level: { valueLabels: { fatal: 'Fatal' } } } }) as unknown as ViewModel

describe('linkTextOf', () => {
  it('is a fixed text as it is', () => {
    expect(linkTextOf(model, viewWith('Error report'), 'report', { report: 'https://example.com/1' })).toBe('Error report')
  })

  it('fills each field as the record page shows it: an enum by its label, a relation by its name', () => {
    const record = { title: 'Crash on save', level: 'fatal', project: { id: 3, name: 'Shop' } }
    expect(linkTextOf(model, viewWith('{level}: {title} ({project})'), 'report', record)).toBe('Fatal: Crash on save (Shop)')
  })

  it('fills a relation by the name resolved for it, else by its key', () => {
    expect(linkTextOf(model, viewWith('Report for {project}'), 'report', { project: 3 }, { project: 'Shop' })).toBe('Report for Shop')
    expect(linkTextOf(model, viewWith('Report for {project}'), 'report', { project: 3 }, { project: undefined })).toBe('Report for 3')
  })

  it('is nothing without link text, or when a field it names is empty, so the address shows', () => {
    expect(linkTextOf(model, viewWith(), 'report', { title: 'x' })).toBeUndefined()
    expect(linkTextOf(model, viewWith('{title}'), 'report', { title: null })).toBeUndefined()
    expect(linkTextOf(model, viewWith('{title} ({level})'), 'report', { title: 'Crash on save', level: '' })).toBeUndefined()
  })
})
