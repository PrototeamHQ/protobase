import type { ResourceModel } from '@protobase/schema'
import { fillFilter, parseTemplatePath } from '@protobase/schema/internal'
import { sampleSlots } from './filter-slots'
import type { SelectInputProps } from './page-params'
import { sampledFilterErrors } from './sampled-filter'

// A filter fed by page parameters is checked once for each value one of them can take, its choices and, without a
// `defaultValue`, the empty value an address without one gives, while the others hold their first value: so a choice
// that breaks the filter fails the build, in as many checks as there are choices.

// The page parameter a slot reads, if it reads one
const paramOf = (path: string) => {
  const parsed = parseTemplatePath(path)
  return parsed?.kind === 'data' && parsed.variable === 'params' ? parsed.names[0] : undefined
}

/** Each value a `SelectInput` can give a read, as the address carries it: its default first. */
export const inputValues = (input: SelectInputProps) => {
  const ids = (input.choices ?? []).map((choice) => String(choice.id))
  return input.defaultValue === undefined ? ['', ...ids] : [String(input.defaultValue), ...ids.filter((id) => id !== String(input.defaultValue))]
}

/**
 * The problems of `filter` on `model`, filled with each value of each page parameter it reads whose `SelectInput`
 * gives choices; other slots stand in for values, as `sampledFilterErrors` takes them. `undefined` when it reads none.
 */
export const choiceFilterProblems = (model: ResourceModel, filter: string, inputs: ReadonlyMap<string, SelectInputProps>): string[] | undefined => {
  const used = [...new Set(sampleSlots(filter).slots.flatMap((slot) => paramOf(slot.path) ?? []))].filter((source) => inputs.get(source)?.choices)
  if (used.length === 0) return
  const first = Object.fromEntries(used.map((source) => [source, inputValues(inputs.get(source)!)[0]!]))
  const problems = used.flatMap((source) =>
    inputValues(inputs.get(source)!).flatMap((value) => {
      const values = { ...first, [source]: value }
      // Every other slot is written back for its stand-in
      const filled = fillFilter(filter, (path) => {
        const param = paramOf(path)
        return param !== undefined && Object.hasOwn(values, param) ? values[param] : `{{${path}}}`
      })
      const errors = sampledFilterErrors(model, filled)
      return errors.length === 0 ? [] : [`filter with ${source} = "${value}": ${errors.join('; ')}`]
    }),
  )
  return [...new Set(problems)]
}
