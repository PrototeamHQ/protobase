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
// With storage on, the workflows' view links to the storage configurations.
const storage = workflowResources('workflows', { storage: true })
const storageViews = { workflows: [storage.workflowsView.toModel(), storage.workflows.toModel()], storage_configurations: [storage.storageConfigurationsView!.toModel(), storage.storageConfigurations!.toModel()] } as const
// With custom steps on, the workflows' view links to them.
const custom = workflowResources('workflows', { customSteps: true })
const customViews = { workflows: [custom.workflowsView.toModel(), custom.workflows.toModel()], custom_steps: [custom.customStepsView!.toModel(), custom.customSteps!.toModel()], custom_step_versions: [custom.customStepVersionsView!.toModel(), custom.customStepVersions!.toModel()], runners: [custom.runnersView!.toModel(), custom.runners!.toModel()], custom_step_jobs: [custom.customStepJobsView!.toModel(), custom.customStepJobs!.toModel()] } as const

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

  it("gives the storage configurations' view and the workflows' link to it in English as the server sends them, and in Dutch", () => {
    for (const [view, model] of Object.values(storageViews)) expect(translatedView(view, model)).toEqual(view)
    setAppLocale('nl')
    expect(translatedView(...storageViews.workflows).actions.map((action) => action.label)).toEqual(['Opslagconfiguraties'])
    const configurations = translatedView(...storageViews.storage_configurations)
    expect(configurations.names).toEqual({ singular: 'Opslagconfiguratie', plural: 'Opslagconfiguraties' })
    expect(configurations.fields.kind?.valueLabels).toEqual({ local: 'Lokale map', s3: 'S3-compatibele bucket' })
    expect(Object.values(configurations.fields).map((hints) => hints.label)).toEqual(['Naam', 'Soort', 'Map', 'Bucket', 'Regio', 'Endpoint', 'Aangemaakt', 'Bijgewerkt'])
    expect(configurations.fields.bucket?.help).toBe('Voor een bucket: de naam')
    expect((configurations.layout[0] as { title: string }).title).toBe('Opslagconfiguratie')
  })

  it("gives the custom steps', runners' and jobs' views and the workflows' links to them in English as the server sends them, and in Dutch", () => {
    for (const [view, model] of Object.values(customViews)) expect(translatedView(view, model)).toEqual(view)
    setAppLocale('nl')
    expect(translatedView(...customViews.workflows).actions.map((action) => action.label)).toEqual(['Eigen stappen', 'Runners'])
    const steps = translatedView(...customViews.custom_steps)
    expect(steps.names).toEqual({ singular: 'Eigen stap', plural: 'Eigen stappen' })
    expect(steps.fields.kind?.valueLabels).toEqual({ container: 'Container' })
    expect(Object.values(steps.fields).map((hints) => hints.label)).toEqual(['Naam', 'Label', 'Beschrijving', 'Soort', 'Container', 'Invoer', 'Uitvoer', 'Foutvoorvoegsel', 'Fouten', 'Versie', 'Aangemaakt', 'Bijgewerkt'])
    expect(steps.layout.flatMap((item) => ('title' in item && item.title !== undefined ? [item.title] : []))).toEqual(['Eigen stap', 'Manifest', 'Versies'])
    const versions = translatedView(...customViews.custom_step_versions)
    expect(versions.names).toEqual({ singular: 'Versie van een eigen stap', plural: 'Versies van eigen stappen' })
    expect(Object.values(versions.fields).map((hints) => hints.label)).toEqual(['Eigen stap', 'Soort', 'Foutvoorvoegsel', 'Opgeslagen door', 'Opgeslagen'])
    const runners = translatedView(...customViews.runners)
    expect(runners.names).toEqual({ singular: 'Runner', plural: 'Runners' })
    expect(Object.values(runners.fields).map((hints) => hints.label)).toEqual(['Naam', 'Labels', 'Ingetrokken', 'Ingetrokken op', 'Registratietoken geldig tot', 'Geregistreerd', 'Platform', 'Soorten', 'Laatste stand', 'Laatste aanvraag', 'Vraagt aan tot', 'Aangemaakt', 'Bijgewerkt'])
    expect(runners.layout.flatMap((item) => ('title' in item && item.title !== undefined ? [item.title] : []))).toEqual(['Runner', 'Machine', 'Taken'])
    const jobs = translatedView(...customViews.custom_step_jobs)
    expect(jobs.names).toEqual({ singular: 'Taak van een eigen stap', plural: 'Taken van eigen stappen' })
    expect(jobs.fields.status?.valueLabels).toEqual({ queued: 'In de wachtrij', running: 'Bezig', succeeded: 'Gelukt', failed: 'Mislukt', timed_out: 'Verlopen' })
  })

  it("leaves the views of an app's own resources, and the tables users add, as they are", () => {
    setAppLocale('nl')
    const own = { ...resources.user_tables!, table: { schema: 'public', name: 'user_tables' } }
    expect(translatedView(views.user_tables!, own)).toEqual(views.user_tables)
    expect(translated('notes')).toEqual(views.notes)
  })
})
