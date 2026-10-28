import { builtInFieldTypes } from '@protobase/schema/internal'
import type { FieldWidget } from '../field-widget'
import { MembersCell, MembersDisplay } from './members-display'
import { MembersEditor } from './members-editor'

/**
 * The built-in `members` field type, for a JSON array of the user ids of members of the organization the session works
 * in: `r.member_ids.widget('members')`. See the field types reference.
 */
export const membersField: FieldWidget = { of: [...builtInFieldTypes.members], display: MembersDisplay, editor: MembersEditor, cell: MembersCell }
