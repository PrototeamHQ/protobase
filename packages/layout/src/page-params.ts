import type { Styled } from './blocks'
import { defineBlock } from './create-node'
import type { LayoutNode } from './node'
import { selectOf } from './select-blocks'
import { walkTree } from './walk'

// A page's parameters: values its own address holds in the query, `?window=7d`, which a `SelectInput` chooses, after
// react-admin's SelectInput (https://marmelab.com/react-admin/SelectInput.html), and a block's `select` sets to the key
// of the row chosen. A layout reads a SelectInput's as `@params.<source>`.

/** One choice, in react-admin's shape: `id` is the value the address holds, `name` what the reader sees. */
export type Choice = { id: string | number; name: string }

/**
 * A choice of the page's parameter `source`, written into the page's own address as `?<source>=<id>`, never into a
 * form. `defaultValue` holds while the address names none of the choices.
 */
export type SelectInputProps = { source: string; choices?: Choice[]; label?: string; defaultValue?: string | number }

export const SelectInput = defineBlock<SelectInputProps & Styled>('SelectInput', false)

/**
 * What a page parameter may be named: a name `@params.<name>` reads, and plain in a query; never `__proto__`, which as
 * a key of the values sets an object's prototype instead.
 */
export const paramNamePattern = /^(?!__proto__$)[A-Za-z_][A-Za-z0-9_]*$/

/** The `SelectInput`s of a page by `source`, the first one where two share it. */
export const pageInputs = (tree: LayoutNode) => {
  const inputs = new Map<string, SelectInputProps>()
  walkTree(tree, (node) => {
    if (node.custom || node.type !== 'SelectInput' || typeof node.props.source !== 'string' || inputs.has(node.props.source)) return
    inputs.set(node.props.source, node.props as unknown as SelectInputProps)
  })
  return inputs
}

/** The page parameters whose `SelectInput` gives choices, the only ones a read may take. */
export const chosenParams = (tree: LayoutNode) => new Set([...pageInputs(tree)].flatMap(([source, input]) => (input.choices ? [source] : [])))

/** The parameter names of a page's blocks with `select`. */
export const selectParams = (tree: LayoutNode) => {
  const names = new Set<string>()
  walkTree(tree, (node) => {
    const selection = selectOf(node)
    if (selection) names.add(selection.param)
  })
  return names
}

/**
 * The value a `SelectInput` holds for what the address gives: the given value when it is one of the choices (any
 * value without choices), else its `defaultValue`, else none.
 */
export const inputValue = (input: SelectInputProps, given: string | undefined): string | undefined => {
  const known = given !== undefined && given !== '' && (input.choices === undefined || input.choices.some((choice) => String(choice.id) === given))
  if (known) return given
  return input.defaultValue === undefined ? undefined : String(input.defaultValue)
}

/** The value of every `SelectInput` of a page, by `source`, from the parameters its address gives; `@params` reads these. */
export const pageParamValues = (tree: LayoutNode, given: Readonly<Record<string, string>> = {}): Record<string, string> => {
  const values: Record<string, string> = {}
  for (const [source, input] of pageInputs(tree)) {
    const value = inputValue(input, Object.hasOwn(given, source) ? given[source] : undefined)
    if (value !== undefined) values[source] = value
  }
  return values
}

/** The choice a `SelectInput` holds, if it is one of its choices. */
export const chosenChoice = (input: SelectInputProps, value: string | undefined) => (value === undefined ? undefined : input.choices?.find((choice) => String(choice.id) === value))
