import type { ActionModel, FieldViewModel, LayoutItemModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { MetaData } from '../../data/meta-data'
import { catalogues, messages } from '../../locale/messages'

const namespace = 'app/built-in-views'
const text = messages(namespace)
type Id = Parameters<typeof text>[0]

// The English catalogue names every text there is; the view's own text stays where it names none.
const translated = (id: string, given: string) => (Object.hasOwn(catalogues.en[namespace], id) ? text(id as Id) : given)

const field = (prefix: string, hints: FieldViewModel): FieldViewModel => ({
  ...hints,
  ...(hints.label !== undefined && { label: translated(`${prefix}.label`, hints.label) }),
  ...(hints.help !== undefined && { help: translated(`${prefix}.help`, hints.help) }),
  ...(hints.valueLabels && { valueLabels: Object.fromEntries(Object.entries(hints.valueLabels).map(([value, label]) => [value, translated(`${prefix}.values.${value}`, label)])) }),
})

// A top-level item's title, help and empty text, by its place in the layout.
const item = (prefix: string, shown: LayoutItemModel): LayoutItemModel => {
  const texts = shown as { title?: string; help?: string; empty?: string }
  return {
    ...shown,
    ...(texts.title !== undefined && { title: translated(`${prefix}.title`, texts.title) }),
    ...(texts.help !== undefined && { help: translated(`${prefix}.help`, texts.help) }),
    ...(texts.empty !== undefined && { empty: translated(`${prefix}.empty`, texts.empty) }),
  } as LayoutItemModel
}

// Activity's table sits in the events schema the app picks, `changes` unless it renames it, so it is keyed as `changes.history`.
const tableKey = (model: ResourceModel) =>
  model.name === 'record_history' && model.table.name === 'history' ? 'changes.history' : `${model.table.schema ?? 'public'}.${model.table.name}`

const action = (prefix: string, shown: ActionModel): ActionModel => ({
  ...shown,
  label: translated(`${prefix}.label`, shown.label),
  ...(shown.confirm !== undefined && { confirm: translated(`${prefix}.confirm`, shown.confirm) }),
})

/**
 * A built-in view with its texts in the active locale, from the `app/built-in-views` catalogue: its names, help, field
 * labels, help and value labels, the titles, help and empty texts of its top-level layout items, and its actions'
 * labels and questions, each keyed by the table of its resource and where the text sits, such as
 * `table_definitions.fields.fields.type.values.long_text`, so an app's own resource of the same name keeps its texts.
 * A text the catalogue does not name stays as `/meta` gives it.
 */
export const translatedView = (view: ViewModel, model: ResourceModel | undefined): ViewModel => {
  if (!model) return view
  const at = tableKey(model)
  return {
    ...view,
    ...(view.names && { names: { singular: translated(`${at}.names.singular`, view.names.singular), plural: translated(`${at}.names.plural`, view.names.plural) } }),
    ...(view.help !== undefined && { help: translated(`${at}.help`, view.help) }),
    fields: Object.fromEntries(Object.entries(view.fields).map(([name, hints]) => [name, field(`${at}.fields.${name}`, hints)])),
    layout: view.layout.map((shown, index) => item(`${at}.layout.${index}`, shown)),
    actions: view.actions.map((shown) => action(`${at}.actions.${shown.name}`, shown)),
  }
}

/** `/meta` with the texts of the built-in views the catalogue translates in the active locale (see `translatedView`). */
export const withTranslatedViews = (meta: MetaData): MetaData => ({ ...meta, views: Object.fromEntries(Object.entries(meta.views).map(([name, view]) => [name, translatedView(view, meta.resources[view.resource])])) })
