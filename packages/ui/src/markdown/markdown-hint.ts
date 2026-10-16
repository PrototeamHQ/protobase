import type { FieldModel, FieldViewModel } from '@protobase/schema'

/** Whether the view shows a field as markdown (`.markdown()`), which only a text field takes. */
export const isMarkdown = (field: FieldModel, hints: FieldViewModel | undefined) => field.type === 'text' && Boolean(hints?.markdown)
