import { conditionForms } from './condition-forms'
import { contentForms } from './content-forms'
import { dataForms } from './data-forms'
import { fieldForms } from './field-forms'
import { structureForms } from './structure-forms'
import type { TextForm } from './text-form'
import { threadForms } from './thread-forms'

/**
 * The built-in blocks' text forms, by block type. A block missing here, such as `Grid`, `Box` or `Tabs`, holds others
 * and reads as their text (`childrenText`). A form of one's own can call the built-in one and wrap or rework its text.
 */
export const textForms: Readonly<Record<string, TextForm>> = { ...structureForms, ...conditionForms, ...contentForms, ...dataForms, ...threadForms, ...fieldForms }
