import { Token } from '../../../primitives/token'
import { PickerCombobox, usePickerSearch } from '../../picker/picker-combobox'
import type { FieldWidgetEditorProps } from '../field-widget'
import { memberIdsOf, memberOptions, toggledId } from './member-ids'
import { text } from './messages'
import { useMembersField } from './use-members-field'

/**
 * Picks the organization's members into the field's array of user ids, as `RecordPicker multiple` picks records: type
 * to narrow them by name, each choice a token that takes it off again, and choosing a chosen member takes them off.
 */
export const MembersEditor = ({ value, invalid, onChange }: FieldWidgetEditorProps) => {
  const search = usePickerSearch()
  const members = useMembersField()
  const ids = memberIdsOf(value)
  if (members.needsOrganizations) return <p className="py-1.5 text-muted-foreground">{text('needsOrganizations')}</p>
  const labelOf = (id: string) => members.member(id)?.name ?? text('unknownMember')
  return (
    <div className="flex flex-col gap-2">
      <PickerCombobox
        search={search}
        options={memberOptions(members.data ?? [], search.text)}
        chosen={ids}
        several
        closedText=""
        placeholder={text('searchMembers')}
        invalid={invalid}
        loading={members.isLoading}
        failed={members.failed}
        onChoose={(option) => onChange(toggledId(ids, option.key))}
      />
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ids.map((id) => (
            <Token key={id} label={labelOf(id)} onRemove={() => onChange(ids.filter((held) => held !== id))} />
          ))}
        </div>
      )}
    </div>
  )
}
