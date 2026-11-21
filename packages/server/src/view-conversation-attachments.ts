import type { AttachmentsModel, ResourceModel } from '@protobase/schema'
import { matchErrors } from './view-related'
import { readable, typedErrors } from './view-typed-field'

/** What is wrong with a conversation's attachments on the messages of `messages`, against the full models; empty when nothing is. */
export const attachmentsErrors = (attachments: AttachmentsModel, messages: string, models: Record<string, ResourceModel>): string[] => {
  const model = models[attachments.resource]
  if (!model) return [`unknown resource "${attachments.resource}"`]
  return [
    ...matchErrors(model, attachments.field, messages).map((error) => `field: ${error}`),
    ...typedErrors(model, 'file', attachments.file, ['file'], 'it holds the file itself, a file field'),
    ...typedErrors(model, 'width', attachments.width, ['integer'], "an image's width is an integer field"),
    ...typedErrors(model, 'height', attachments.height, ['integer'], "an image's height is an integer field"),
  ]
}

/**
 * The attachments as a caller whose `models` hold only what they may read sees them: gone when they cannot read the
 * resource, its relation or its file, and without an image's width or height when they cannot read that field.
 */
export const pruneAttachments = (attachments: AttachmentsModel, models: Record<string, ResourceModel>): AttachmentsModel | undefined => {
  const { width, height, ...core } = attachments
  const model = models[attachments.resource]
  if (!readable(model, core.field) || !readable(model, core.file)) return
  return { ...core, ...(readable(model, width) && { width }), ...(readable(model, height) && { height }) }
}
