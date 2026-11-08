import { afterEach, describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { workflowResources } from '@protobase/schema/internal'
import { setAppLocale } from '../../locale/active-locale'
import recorded from '../testing/user-tables-meta.json' with { type: 'json' }
import { translatedView } from './translated-views'

const resources = Object.fromEntries((recorded.resources as unknown as ResourceModel[]).map((model) => [model.name, model]))
const views = Object.fromEntries((recorded.views as unknown as ViewModel[]).map((view) => [view.resource, view]))
const translated = (name: string) => translatedView(views[name]!, resources[name])
// The workflow views as the server builds them for `/meta`, in their default schema.
const parts = workflowResources('workflows')
const workflowViews = { workflows: [parts.workflowsView.toModel(), parts.workflows.toModel()], workflow_resolutions: [parts.workflowResolutionsView.toModel(), parts.workflowResolutions.toModel()] } as const

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

  it("gives the workflows' status texts and the resolutions' view in English as the server sends them, and in Dutch", () => {
    for (const [view, model] of Object.values(workflowViews)) expect(translatedView(view, model)).toEqual(view)
    setAppLocale('nl')
    const workflows = translatedView(...workflowViews.workflows)
    expect(workflows.fields.run_status?.label).toBe('Status')
    expect(workflows.fields.run_status?.valueLabels).toMatchObject({ failing: 'Laatste run mislukt', unresolved: 'Eerdere fout onopgelost', healthy: 'Geen onopgeloste fouten' })
    expect([workflows.fields.resolved_at?.label, workflows.fields.resolved_by?.label]).toEqual(['Opgelost', 'Opgelost door'])
    const resolutions = translatedView(...workflowViews.workflow_resolutions)
    expect(resolutions.names).toEqual({ singular: 'Markering als opgelost', plural: 'Markeringen als opgelost' })
    expect(Object.values(resolutions.fields).map((hints) => hints.label)).toEqual(['Workflow', 'Opgelost door', 'Opgelost'])
  })

  it("leaves the views of an app's own resources, and the tables users add, as they are", () => {
    setAppLocale('nl')
    const own = { ...resources.user_tables!, table: { schema: 'public', name: 'user_tables' } }
    expect(translatedView(views.user_tables!, own)).toEqual(views.user_tables)
    expect(translated('notes')).toEqual(views.notes)
  })
})
