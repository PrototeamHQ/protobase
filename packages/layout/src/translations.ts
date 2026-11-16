import { IntlMessageFormat } from 'intl-messageformat'
import { defineBlock } from './create-node'
import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from './node'
import type { Recorded, Register } from './typed/types'

// The app's own texts in each of its languages, as ICU messages (the syntax `intl-messageformat` reads), and the
// <Trans> element that shows one by its key, as react-i18next's <Trans i18nKey values components /> does.

/** A language's texts as written: keys nested as deep as one likes, each message ICU text. */
export type TextTree = { readonly [key: string]: string | TextTree }

/** The dotted keys of a tree of texts: `{ today: { title: '…' } }` has `today.title`. */
export type TextKeys<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${TextKeys<T[K]>}` }[keyof T & string]

/** The app's texts in each of its languages, flattened by key, as `translations({ en, nl })` makes them. */
export type Translations<Keys extends string = string> = {
  readonly kind: 'translations'
  /** Each language's messages by dotted key; every language has every key. */
  readonly languages: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** The keys, for the compiler only; never set. */
  readonly $keys?: Keys
}

const flatten = (tree: TextTree, at = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [[`${at}${key}`, value] as [string, string]] : flatten(value, `${at}${key}.`)))

/**
 * The app's texts in each of its languages, from one JSON file per language: `translations({ en, nl })`, exported from
 * `config/index.ts`. Every message must parse as ICU, every language must have the same keys, and each language must
 * be a BCP 47 tag, such as `en`, `nl` or `pt-BR`.
 */
export const translations = <const L extends Record<string, TextTree>>(languages: L): Translations<TextKeys<L[keyof L]>> => {
  const tags = Object.keys(languages)
  if (tags.length === 0) throw new Error('translations() takes at least one language, such as translations({ en })')
  const flat = Object.fromEntries(tags.map((tag) => [tag, Object.fromEntries(flatten(languages[tag]!))]))
  const problems: string[] = []
  for (const tag of tags) {
    try {
      Intl.getCanonicalLocales(tag)
    } catch {
      problems.push(`"${tag}" is not a language tag, such as en, nl or pt-BR`)
      continue
    }
    for (const [key, message] of Object.entries(flat[tag]!)) {
      try {
        new IntlMessageFormat(message, tag)
      } catch (error) {
        problems.push(`${tag}: "${key}" is not an ICU message: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  const keys = new Set(tags.flatMap((tag) => Object.keys(flat[tag]!)))
  for (const tag of tags) {
    const missing = [...keys].filter((key) => !Object.hasOwn(flat[tag]!, key))
    if (missing.length > 0) problems.push(`${tag} lacks ${missing.map((key) => `"${key}"`).join(', ')}, which ${tags.filter((other) => other !== tag && missing.some((key) => Object.hasOwn(flat[other]!, key))).join(', ')} has`)
  }
  if (problems.length > 0) throw new Error(`The app's translations are not usable: ${problems.join('; ')}`)
  return { kind: 'translations', languages: flat }
}

export const isTranslations = (value: unknown): value is Translations =>
  typeof value === 'object' && value !== null && (value as Translations).kind === 'translations' && typeof (value as Translations).languages === 'object'

// The node types of a parsed ICU message (@formatjs/icu-messageformat-parser's TYPE), by what the checks read of them
const argumentTypes = new Set([1, 2, 3, 4, 5, 6])
const tagType = 8
type MessageElement = { type: number; value?: string; options?: Record<string, { value: MessageElement[] }>; children?: MessageElement[] }

const walk = (elements: readonly MessageElement[], found: { values: Set<string>; tags: Set<string> }) => {
  for (const element of elements) {
    if (argumentTypes.has(element.type) && element.value !== undefined) found.values.add(element.value)
    if (element.type === tagType && element.value !== undefined) found.tags.add(element.value)
    for (const option of Object.values(element.options ?? {})) walk(option.value, found)
    if (element.children) walk(element.children, found)
  }
}

/** The values a message formats (`{name}`, `{count, plural, …}`) and the tags it holds (`<b>…</b>`). */
export const messageParts = (message: string, language: string) => {
  const found = { values: new Set<string>(), tags: new Set<string>() }
  walk(new IntlMessageFormat(message, language).getAst() as unknown as MessageElement[], found)
  return { values: [...found.values], tags: [...found.tags] }
}

/** The texts a reader gets: their language and the messages by key, of the keys what they see uses. */
export type ReaderTexts = { locale: string; messages: Readonly<Record<string, string>> }

const compiled = new Map<string, IntlMessageFormat>()

/**
 * A message formatted in the reader's language with `values`, or its key when the texts lack it, which the startup
 * check makes impossible in a valid app. Tags format through `tags`, each given the formatted text inside it.
 */
export const formatMessage = <T = string>(texts: ReaderTexts | undefined, key: string, values: Record<string, unknown> = {}, tags: Record<string, (chunks: unknown[]) => T> = {}): string | (string | T)[] => {
  const message = texts?.messages[key]
  if (message === undefined || !texts) return key
  const id = `${texts.locale}\u0000${message}`
  let format = compiled.get(id)
  if (!format) {
    format = new IntlMessageFormat(message, texts.locale)
    compiled.set(id, format)
  }
  return format.format({ ...values, ...tags }) as string | (string | T)[]
}

/** A message as plain text: its tags' text kept, the tags themselves left out. */
export const formatText = (texts: ReaderTexts | undefined, key: string, values: Record<string, unknown> = {}) => {
  const tags = Object.fromEntries((texts?.messages[key] ? messageParts(texts.messages[key], texts.locale).tags : []).map((tag) => [tag, (chunks: unknown[]) => chunks.join('')]))
  const formatted = formatMessage(texts, key, values, tags)
  return Array.isArray(formatted) ? formatted.join('') : formatted
}

type AppTexts = Register extends { app: infer A extends object } ? { [K in keyof A]: A[K] extends Translations<infer Keys> ? Keys : never }[keyof A] : never

/** The keys of the app's texts, or any key without the generated types. */
export type TransKey = [AppTexts] extends [never] ? string : AppTexts

/** A value a message formats: one of its own, or a recorded path of a typed layout, `data.title`. */
type TransValue = string | number | boolean | null | Recorded<unknown>

/**
 * A text in the reader's language, by its key, as react-i18next's `<Trans i18nKey values components />`: ICU text
 * whose `{name}` takes `values.name`, here a value or a recorded path such as `data.title`, and whose tags, `<b>…</b>`,
 * draw as `components.b`. It goes where text goes, a child or a prop such as a `title`, `label` or `empty`.
 */
export const Trans = defineBlock<{ i18nKey: TransKey; values?: Record<string, TransValue>; components?: Record<string, LayoutNode> }>('Trans', false)

/** Whether a value is a `<Trans>` element. */
export const isTrans = (value: LayoutValue | LayoutChild | undefined): value is LayoutNode => isLayoutNode(value) && value.type === 'Trans' && !value.custom

/** Every key a tree's `<Trans>` elements name, in its children and its props. */
export const transKeys = (node: LayoutNode): string[] => {
  const own = isTrans(node) && typeof node.props.i18nKey === 'string' ? [node.props.i18nKey] : []
  const inProps = Object.values(node.props).flatMap((value) => (isLayoutNode(value) ? transKeys(value) : Array.isArray(value) ? value.flatMap((item) => (isLayoutNode(item) ? transKeys(item) : [])) : isObject(value) ? Object.values(value).flatMap((item) => (isLayoutNode(item) ? transKeys(item) : [])) : []))
  const inChildren = node.children.flatMap((child) => (typeof child === 'string' ? [] : transKeys(child)))
  return [...new Set([...own, ...inProps, ...inChildren, ...(node.fallback ?? []).flatMap((child) => (typeof child === 'string' ? [] : transKeys(child)))])]
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The language a reader gets of `languages`, the app's translations: the app's own when it sets one, else the first of
 * the reader's own (`Accept-Language`) the app has, by its full tag or its language, else the first the app has.
 */
export const readerLanguage = (languages: readonly string[], preferred: readonly string[], fixed?: string): string | undefined => {
  if (languages.length === 0) return
  if (fixed && languages.includes(fixed)) return fixed
  for (const tag of preferred) {
    const exact = languages.find((language) => language.toLowerCase() === tag.toLowerCase())
    if (exact) return exact
    const base = tag.split('-')[0]!.toLowerCase()
    const near = languages.find((language) => language.split('-')[0]!.toLowerCase() === base)
    if (near) return near
  }
  return languages.includes('en') ? 'en' : languages[0]
}

// Every <Trans> element of a tree, in its props and its children
const transNodes = (node: LayoutNode): LayoutNode[] => {
  const inValue = (value: unknown): LayoutNode[] =>
    isLayoutNode(value) ? transNodes(value) : Array.isArray(value) ? value.flatMap(inValue) : isObject(value) ? Object.values(value).flatMap(inValue) : []
  const children = [...node.children, ...(node.fallback ?? [])].flatMap((child) => (typeof child === 'string' ? [] : transNodes(child)))
  return [...(isTrans(node) ? [node] : []), ...Object.values(node.props).flatMap(inValue), ...children]
}

/**
 * What the `<Trans>` elements of the app's trees, by where each sits, ask that its translations lack: a key no language
 * has, a value its message formats in some language that the element does not give, or a tag with no component.
 */
export const translationProblems = (trees: readonly { at: string; tree: LayoutNode }[], given: Translations | undefined): string[] =>
  trees.flatMap(({ at, tree }) =>
    transNodes(tree).flatMap((node) => {
      const key = String(node.props.i18nKey)
      if (!given) return [`${at}: <Trans i18nKey="${key}"> needs the app's texts: export translations({ en, ... }) from the config`]
      const languages = Object.entries(given.languages)
      if (!languages.some(([, messages]) => Object.hasOwn(messages, key))) return [`${at}: <Trans i18nKey="${key}">: no language has "${key}"`]
      const values = new Set(Object.keys(isObject(node.props.values) ? node.props.values : {}))
      const components = new Set(Object.keys(isObject(node.props.components) ? node.props.components : {}))
      const parts = languages.map(([language, messages]) => messageParts(messages[key]!, language))
      const missing = [...new Set(parts.flatMap((part) => part.values))].filter((name) => !values.has(name))
      const untagged = [...new Set(parts.flatMap((part) => part.tags))].filter((name) => !components.has(name))
      return [
        ...(missing.length > 0 ? [`${at}: <Trans i18nKey="${key}"> formats ${missing.map((name) => `{${name}}`).join(', ')}; give it in values`] : []),
        ...(untagged.length > 0 ? [`${at}: <Trans i18nKey="${key}"> has the tag${untagged.length > 1 ? 's' : ''} ${untagged.map((name) => `<${name}>`).join(', ')}; give each an element in components`] : []),
      ]
    }),
  )
