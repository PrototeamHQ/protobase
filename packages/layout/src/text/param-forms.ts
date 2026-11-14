import { chosenChoice, type SelectInputProps } from '../page-params'
import { escapeMarkdown, labelled, valueText } from './markdown'
import type { TextForm } from './text-form'

// A `SelectInput` reads as its label and the name of the choice it holds; one without choices as the value itself.
const SelectInput: TextForm = ({ node, options }) => {
  const input = node.props as unknown as SelectInputProps
  const value = options.params?.[input.source]
  const shown = input.choices ? chosenChoice(input, value)?.name : value
  return labelled(escapeMarkdown(input.label ?? input.source), shown === undefined ? '' : valueText(shown))
}

export const paramForms: Record<string, TextForm> = { SelectInput }
