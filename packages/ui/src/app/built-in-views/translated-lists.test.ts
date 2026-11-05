import { afterEach, describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { setAppLocale } from '../../locale/active-locale'
import recorded from '../testing/built-in-views-meta.json' with { type: 'json' }
import { translatedView } from './translated-views'

// Recorded with the events schema renamed to `outbox`, so Activity's table is `outbox.history`.
const resources = Object.fromEntries((recorded.resources as unknown as ResourceModel[]).map((model) => [model.name, model]))
const views = Object.fromEntries((recorded.views as unknown as ViewModel[]).map((view) => [view.resource, view]))
const translated = (name: string) => translatedView(views[name]!, resources[name])
const titles = (view: ViewModel) => view.layout.map((item) => (item as { title?: string }).title)
const labels = (view: ViewModel) => Object.fromEntries(Object.entries(view.fields).map(([name, hints]) => [name, hints.label]))

afterEach(() => setAppLocale(undefined))

describe('translatedView of the lists Protobase adds', () => {
  it('gives the English the server sends, text for text', () => {
    for (const name of ['failed_jobs', 'record_history', 'record_comments']) expect(translated(name)).toEqual(views[name])
  })

  it('puts Failed jobs in Dutch: names, help, labels, sections and actions', () => {
    setAppLocale('nl')
    const view = translated('failed_jobs')
    expect(view.names).toEqual({ singular: 'Mislukte taak', plural: 'Mislukte taken' })
    expect(view.help).toMatch(/^Taken die al hun pogingen/)
    expect(labels(view)).toEqual({ name: 'Taak', error: 'Laatste fout', attempts: 'Pogingen', failed_at: 'Mislukt', created_at: 'In de wachtrij gezet', key: 'Sleutel', payload: 'Gegevens', output: 'Foutdetails' })
    expect(titles(view)).toEqual(['Fout', 'Taak', undefined])
    expect(view.actions.map((action) => [action.label, action.confirm])).toEqual([
      ['Opnieuw proberen', 'Deze taak vanaf nu nog één keer uitvoeren?'],
      ['Verwijderen', 'Deze taak verwijderen? Hij wordt niet meer uitgevoerd.'],
    ])
  })

  it('puts Activity in Dutch, whatever schema keeps its changes', () => {
    setAppLocale('nl')
    const view = translated('record_history')
    expect(view.names).toEqual({ singular: 'Wijziging', plural: 'Activiteit' })
    expect(view.help).toMatch(/^Elke wijziging/)
    expect(labels(view)).toEqual({
      resource: 'Onderdeel', record_key: 'Record', operation: 'Bewerking', before: 'Ervoor', after: 'Erna', actor_id: 'Door', actor_roles: 'Handelend als',
      database_role: 'Databaserol', changed: 'Gewijzigde velden', transaction: 'Transactie', at: 'Wanneer',
    })
    expect(view.fields.operation?.valueLabels).toEqual({ create: 'Aangemaakt', update: 'Gewijzigd', delete: 'Verwijderd', undelete: 'Teruggezet' })
    expect(titles(view)).toEqual(['Wijziging', 'Ervoor en erna', undefined])
  })

  it('puts Comments in Dutch', () => {
    setAppLocale('nl')
    const view = translated('record_comments')
    expect(view.names).toEqual({ singular: 'Opmerking', plural: 'Opmerkingen' })
    expect(view.help).toMatch(/^Elke opmerking/)
    expect(labels(view)).toEqual({ resource: 'Onderdeel', record_key: 'Record', author_id: 'Door', body: 'Opmerking', mentions: 'Vermeldingen', created_at: 'Wanneer' })
    expect(titles(view)).toEqual(['Opmerking', undefined])
  })

  it("leaves an app's own resource over a table named history as it is", () => {
    setAppLocale('nl')
    expect(translatedView(views.record_history!, { ...resources.record_history!, name: 'audit_log' })).toEqual(views.record_history)
  })
})
