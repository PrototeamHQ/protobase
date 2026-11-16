import { formatText, isTrans, readerLanguage, transKeys, type PageModel, type ReaderTexts, type Translations } from '@protobase/layout'
import type { ActionModel, FieldViewModel, LayoutItemModel, ViewModel } from '@protobase/schema'
import { layoutItems } from '@protobase/schema/internal'

// The app's own texts for one reader: their language, the messages the pages and record blocks they see name, and the
// labels of the views in that language, keyed by where each sits in the config.

/** The reader's language of the app's translations: the app's fixed one, else the best of theirs, else English or the first. */
export const textsLanguage = (translations: Translations | undefined, preferred: readonly string[], fixed?: string) => (translations ? readerLanguage(Object.keys(translations.languages), preferred, fixed) : undefined)

/** The block trees of a view's record page, its tabs' too. */
export const blockTrees = (view: ViewModel) => layoutItems(view.layout).flatMap((item) => (item.kind === 'blocks' ? [item.tree as PageModel['tree']] : []))

/** The messages a reader's pages, account page and record pages' blocks name, in their language. */
export const readerTexts = (translations: Translations, language: string, pages: readonly PageModel[], views: readonly ViewModel[]): ReaderTexts => {
  const messages = translations.languages[language] ?? {}
  const keys = new Set([...pages.flatMap((page) => transKeys(page.tree)), ...views.flatMap((view) => blockTrees(view).flatMap(transKeys))])
  return { locale: language, messages: Object.fromEntries([...keys].flatMap((key) => (Object.hasOwn(messages, key) ? [[key, messages[key]!]] : []))) }
}

/** A page with its title in the reader's language, when the tree's title is a `<Trans>`, so the sidebar names it so too. */
export const translatedPage = (page: PageModel, texts: ReaderTexts): PageModel => {
  const title = page.tree.props.title
  if (!isTrans(title) || typeof title.props.i18nKey !== 'string') return page
  const values = title.props.values
  return { ...page, title: formatText(texts, title.props.i18nKey, typeof values === 'object' && values !== null && !Array.isArray(values) ? values : {}) }
}

const keyed = (all: Readonly<Record<string, string>>, locale: string) => (key: string, given: string) => (Object.hasOwn(all, key) ? formatText({ locale, messages: all }, key) : given)

/**
 * A view with the labels the app's translations give it in the reader's language, keyed by its resource:
 * `resources.<name>.names.singular` and `.plural`, `.help`, `.fields.<field>.label`, `.help` and `.values.<value>`,
 * `.layout.<index>.title`, `.help` and `.empty` (a tab's own items under `.layout.<index>.items.<index>`), and `.actions.<action>.label` and `.confirm`. A label the
 * translations leave out stays as the config writes it.
 */
export const translatedView = (view: ViewModel, translations: Translations, language: string): ViewModel => {
  const text = keyed(translations.languages[language] ?? {}, language)
  const at = `resources.${view.resource}`
  const field = (prefix: string, hints: FieldViewModel): FieldViewModel => ({
    ...hints,
    ...(hints.label !== undefined && { label: text(`${prefix}.label`, hints.label) }),
    ...(hints.help !== undefined && { help: text(`${prefix}.help`, hints.help) }),
    ...(hints.valueLabels && { valueLabels: Object.fromEntries(Object.entries(hints.valueLabels).map(([value, label]) => [value, text(`${prefix}.values.${value}`, label)])) }),
  })
  const item = (prefix: string, shown: LayoutItemModel): LayoutItemModel => {
    const texts = shown as { title?: string; help?: string; empty?: string; items?: LayoutItemModel[] }
    return {
      ...shown,
      ...(texts.items && { items: texts.items.map((inner, index) => item(`${prefix}.items.${index}`, inner)) }),
      ...(texts.title !== undefined && { title: text(`${prefix}.title`, texts.title) }),
      ...(texts.help !== undefined && { help: text(`${prefix}.help`, texts.help) }),
      ...(texts.empty !== undefined && { empty: text(`${prefix}.empty`, texts.empty) }),
    } as LayoutItemModel
  }
  const action = (prefix: string, shown: ActionModel): ActionModel => ({ ...shown, label: text(`${prefix}.label`, shown.label), ...(shown.confirm !== undefined && { confirm: text(`${prefix}.confirm`, shown.confirm) }) })
  return {
    ...view,
    ...(view.names && { names: { singular: text(`${at}.names.singular`, view.names.singular), plural: text(`${at}.names.plural`, view.names.plural) } }),
    ...(view.help !== undefined && { help: text(`${at}.help`, view.help) }),
    fields: Object.fromEntries(Object.entries(view.fields).map(([name, hints]) => [name, field(`${at}.fields.${name}`, hints)])),
    layout: view.layout.map((shown, index) => item(`${at}.layout.${index}`, shown)),
    actions: view.actions.map((shown) => action(`${at}.actions.${shown.name}`, shown)),
  }
}
