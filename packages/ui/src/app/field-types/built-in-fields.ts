import type { FieldWidget } from './field-widget'
import { membersField } from './members/members-field'

/** The field types Protobase brings, which a view chooses by name like a plugin's; a plugin's of the same name wins. */
export const builtInFields: Readonly<Record<string, FieldWidget>> = { members: membersField }
