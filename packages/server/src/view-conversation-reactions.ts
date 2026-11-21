import type { ReactionsModel, ResourceModel } from '@protobase/schema'
import { matchErrors } from './view-related'
import { readable, typedErrors } from './view-typed-field'

// Each emoji of the set is drawn and named by its label, and a label names only an emoji of the set
const labelErrors = (labels: ReactionsModel['labels'], values: readonly string[]) => [
  ...values.filter((value) => !Object.hasOwn(labels, value)).map((value) => `labels: no label for "${value}"`),
  ...Object.keys(labels).filter((value) => !values.includes(value)).map((value) => `labels: "${value}" is no value of the emoji field`),
  ...Object.entries(labels).flatMap(([value, label]) => (label.symbol.trim() === '' || label.name.trim() === '' ? [`labels: "${value}" needs a symbol and a name`] : [])),
]

/** What is wrong with a conversation's reactions on the messages of `messages`, against the full models; empty when nothing is. */
export const reactionsErrors = (reactions: ReactionsModel, messages: string, models: Record<string, ResourceModel>): string[] => {
  const model = models[reactions.resource]
  if (!model) return [`unknown resource "${reactions.resource}"`]
  const emoji = Object.hasOwn(model.fields, reactions.emoji) ? model.fields[reactions.emoji] : undefined
  return [
    ...matchErrors(model, reactions.field, messages).map((error) => `field: ${error}`),
    ...typedErrors(model, 'user', reactions.user, ['text'], 'it holds the user id of the person who reacted'),
    ...typedErrors(model, 'emoji', reactions.emoji, ['enum'], 'the emoji set is the values of an enum field'),
    ...(emoji?.type === 'enum' ? labelErrors(reactions.labels, emoji.enumValues ?? []) : []),
  ]
}

/** Whether a caller whose `models` hold only what they may read can read the reactions: the resource and each field the conversation shows. */
export const readsReactions = (reactions: ReactionsModel, models: Record<string, ResourceModel>) =>
  [reactions.field, reactions.user, reactions.emoji].every((name) => readable(models[reactions.resource], name))
