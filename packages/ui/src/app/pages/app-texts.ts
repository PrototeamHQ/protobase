import { formatText, isTrans, type LayoutNode, type LayoutValue, type ReaderTexts } from '@protobase/layout'
import { createContext, useContext } from 'react'

// The app's own texts in the user's language, from `/meta`, which a page's `<Trans>` elements format.

export const AppTexts = createContext<ReaderTexts | undefined>(undefined)

export const useAppTexts = () => useContext(AppTexts)

const isObject = (value: unknown): value is Record<string, LayoutValue> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A `<Trans>` as plain text in the user's language: what a prop drawn as text, a `title` or a `label`, shows. */
export const transText = (node: LayoutNode, texts: ReaderTexts | undefined) => formatText(texts, String(node.props.i18nKey), isObject(node.props.values) ? node.props.values : {})

const ownPropTexts = (node: LayoutNode, texts: ReaderTexts | undefined): LayoutNode =>
  node.custom || !Object.values(node.props).some(isTrans) ? node : { ...node, props: Object.fromEntries(Object.entries(node.props).map(([name, value]) => [name, isTrans(value) ? transText(value, texts) : value])) }

/**
 * The element with each `<Trans>` in its props as its text, so a block draws its `title` or `empty` as any text; a
 * `Tabs`' tabs' labels too, which it reads to draw its tab bar before each `Tab` draws.
 */
export const withPropTexts = (node: LayoutNode, texts: ReaderTexts | undefined): LayoutNode => {
  const own = ownPropTexts(node, texts)
  if (node.custom || node.type !== 'Tabs') return own
  const children = own.children.map((child) => (typeof child === 'string' ? child : ownPropTexts(child, texts)))
  return children.some((child, index) => child !== own.children[index]) ? { ...own, children } : own
}
