import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

type Catalogue = Record<string, Record<string, string>>

// The values and tags a message names, as the standard ICU parser reads it.
const namesOf = (elements: MessageFormatElement[], into = { values: new Set<string>(), tags: new Set<string>() }) => {
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue
    if (element.type === TYPE.tag) {
      into.tags.add(element.value)
      namesOf(element.children, into)
      continue
    }
    into.values.add(element.value)
    if (element.type === TYPE.select || element.type === TYPE.plural) for (const option of Object.values(element.options)) namesOf(option.value, into)
  }
  return into
}

/** Each message of a catalogue by `area.id`, with the values and tags it names; throws on one the ICU parser refuses. */
export const catalogueShape = (catalogue: Catalogue) =>
  Object.fromEntries(
    Object.entries(catalogue).flatMap(([area, texts]) =>
      Object.entries(texts).map(([id, message]) => {
        const { values, tags } = namesOf(parse(message))
        return [`${area}.${id}`, { values: [...values].sort(), tags: [...tags].sort() }]
      }),
    ),
  )

/** The messages of `translation` that name a value the English one does not, so the caller never passes it. */
export const unknownValues = (english: Catalogue, translation: Catalogue) => {
  const from = catalogueShape(english)
  return Object.entries(catalogueShape(translation)).flatMap(([id, { values }]) => values.filter((value) => !from[id]?.values.includes(value)).map((value) => `${id}: ${value}`))
}
