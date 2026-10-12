import type { ComponentType } from 'react'
import type { FieldModel, FieldType, JsonValue } from '@protobase/schema'

/** What a field type's display and cell get: the field, its value as the API gives it (null when empty) and the view's props. */
export type FieldWidgetProps<V = unknown, P = Record<string, JsonValue>> = {
  field: FieldModel
  value: V | null
  /** What the view gives in `.widget(name, props)`; `{}` without props. */
  props: P
}

/** What a field type's editor gets besides: a way to set the value, and whether the value it holds is refused. */
export type FieldWidgetEditorProps<V = unknown, P = Record<string, JsonValue>> = FieldWidgetProps<V, P> & {
  onChange: (value: V | null) => void
  invalid: boolean
}

/**
 * A field type a plugin registers in `definePlugin({ fields: { rating: ... } })`, which a view chooses for a field with
 * `r.score.widget('rating', props)`: the storage types it shows (`of`), how it shows a value on record pages, cards and
 * page blocks (`display`), how it edits one on forms (`editor`; else the built-in input) and in a table (`cell`; else
 * `display`). On a field of another storage type, and when it throws, the field shows as it would without it.
 */
export type FieldWidget = {
  of: FieldType[]
  display: ComponentType<FieldWidgetProps<any, any>>
  editor?: ComponentType<FieldWidgetEditorProps<any, any>>
  cell?: ComponentType<FieldWidgetProps<any, any>>
}
