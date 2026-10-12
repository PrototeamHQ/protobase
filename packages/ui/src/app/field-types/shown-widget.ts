import type { FieldModel, FieldViewModel, JsonValue } from '@protobase/schema'
import { useProjectUi } from '../pages/project-ui'
import type { FieldWidget } from './field-widget'

/** The field type a field shows with: its registered name, its components and the view's props for it. */
export type ShownWidget = { name: string; widget: FieldWidget; props: Record<string, JsonValue> }

/**
 * The field type the view's `hints` choose for `field`, when one of `fields` has that name and shows the field's
 * storage type; otherwise undefined, and the field shows as it would without one. A sensitive field never comes with
 * its value, so it keeps its own.
 */
export const shownWidget = (fields: Readonly<Record<string, FieldWidget>> | undefined, field: FieldModel, hints: FieldViewModel | undefined): ShownWidget | undefined => {
  const chosen = hints?.widget
  if (!chosen || field.sensitive || !fields || !Object.hasOwn(fields, chosen.name)) return undefined
  const widget = fields[chosen.name]!
  return widget.of.includes(field.type) ? { name: chosen.name, widget, props: chosen.props ?? {} } : undefined
}

/** `shownWidget` with the field types of the project's UI and its plugins. */
export const useShownWidget = (field: FieldModel, hints: FieldViewModel | undefined) => shownWidget(useProjectUi().fields, field, hints)
