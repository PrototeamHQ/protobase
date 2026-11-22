import { messageParts, type Translations } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'

// What one label of a check asks that the app cannot give: a value no field of its resource holds
const labelProblems = (model: ResourceModel, name: string, label: string, language: string, at: string) => {
  const unknown = messageParts(label, language).values.filter((value) => !Object.hasOwn(model.fields, value))
  return unknown.length > 0 ? [`${at} formats ${unknown.map((value) => `{${value}}`).join(', ')}, which no field of ${model.name} holds, and the app fills a check's values from the record`] : []
}

/**
 * What the labels of the resources' `.checks()`, as the config writes them and as each language of `translations` gives
 * them, ask that the app cannot fill: a value that is not a field of the resource, since the app fills them from the
 * record, never from the database's error.
 */
export const checkLabelProblems = (models: readonly ResourceModel[], translations: Translations | undefined) =>
  models.flatMap((model) =>
    Object.entries(model.checks ?? {}).flatMap(([name, check]) => [
      ...labelProblems(model, name, check.label, 'en', `Resource "${model.name}": check "${name}"'s label`),
      ...Object.entries(translations?.languages ?? {}).flatMap(([language, messages]) => {
        const key = `resources.${model.name}.checks.${name}.label`
        return Object.hasOwn(messages, key) ? labelProblems(model, name, messages[key]!, language, `The ${language} text "${key}"`) : []
      }),
    ]),
  )
