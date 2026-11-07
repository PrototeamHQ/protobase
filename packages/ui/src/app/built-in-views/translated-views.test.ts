import { afterEach, describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { setAppLocale } from '../../locale/active-locale'
import recorded from '../testing/user-tables-meta.json' with { type: 'json' }
import { translatedView } from './translated-views'

const resources = Object.fromEntries((recorded.resources as unknown as ResourceModel[]).map((model) => [model.name, model]))
const views = Object.fromEntries((recorded.views as unknown as ViewModel[]).map((view) => [view.resource, view]))
const translated = (name: string) => translatedView(views[name]!, resources[name])

afterEach(() => setAppLocale(undefined))

describe('translatedView', () => {
  it('gives the English the server sends, text for text, for the views tables are made in', () => {
    expect(translated('user_tables')).toEqual(views.user_tables)
    expect(translated('user_table_fields')).toEqual(views.user_table_fields)
  })

  it('puts their names, labels, field types, sections and actions in Dutch', () => {
    setAppLocale('nl')
    const tables = translated('user_tables')
    expect(tables.names).toEqual({ singular: 'Tabel', plural: 'Tabellen' })
    expect(tables.layout.map((item) => (item as { title: string }).title)).toEqual(['Tabel', 'Velden'])
    expect(tables.actions.map((action) => action.label)).toEqual(['Tabel openen', 'Veld toevoegen'])
    const fields = translated('user_table_fields')
    expect(fields.fields.type?.label).toBe('Type')
    expect(fields.fields.type?.valueLabels).toMatchObject({ long_text: 'Lange tekst', boolean: 'Ja of nee' })
  })

  it("leaves the views of an app's own resources, and the tables users add, as they are", () => {
    setAppLocale('nl')
    const own = { ...resources.user_tables!, table: { schema: 'public', name: 'user_tables' } }
    expect(translatedView(views.user_tables!, own)).toEqual(views.user_tables)
    expect(translated('notes')).toEqual(views.notes)
  })
})
