import { Field } from '../../../record-view/field'
import { Input } from '../../../primitives/input'
import { ImportSelect } from '../import-select'
import { text } from '../messages'
import type { FieldTexts } from './field-texts'
import type { ProposalProblems } from './proposal-problems'
import { includedFields, type TableProposal } from './table-proposal'

type TableSectionProps = {
  proposal: TableProposal
  problems: ProposalProblems
  texts: FieldTexts
  onChange: (edit: Partial<Pick<TableProposal, 'name' | 'pluralLabel' | 'singularLabel' | 'titleField'>>) => void
}

const none = ''

/** The new table's labels, name and title field, as the New table form asks for them. */
export const TableSection = ({ proposal, problems, texts, onChange }: TableSectionProps) => {
  const titles = includedFields(proposal).filter((field) => field.type === 'text')
  const plural = texts.table('plural_label')
  const singular = texts.table('singular_label')
  const name = texts.table('name')
  const title = texts.table('title_field')
  return (
    <section aria-label={text('newTable')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={plural.label} help={plural.help} error={problems.pluralLabel} required>
        <Input wrapperClassName="max-sm:min-h-11" value={proposal.pluralLabel} onChange={(event) => onChange({ pluralLabel: event.target.value })} />
      </Field>
      <Field label={singular.label} help={singular.help} error={problems.singularLabel} required>
        <Input wrapperClassName="max-sm:min-h-11" value={proposal.singularLabel} onChange={(event) => onChange({ singularLabel: event.target.value })} />
      </Field>
      <Field label={name.label} help={name.help} error={problems.name} required>
        <Input wrapperClassName="max-sm:min-h-11" className="font-mono" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={proposal.name} onChange={(event) => onChange({ name: event.target.value })} />
      </Field>
      <ImportSelect
        label={title.label}
        value={proposal.titleField ?? none}
        options={[{ value: none, label: text('noTitle') }, ...titles.map((field) => ({ value: field.name, label: field.label || field.name }))]}
        onChange={(value) => onChange({ titleField: value || undefined })}
        help={title.help}
      />
    </section>
  )
}
