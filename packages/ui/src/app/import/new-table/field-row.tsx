import { widerFieldTypes, type UserTableFieldType } from '@protobase/schema'
import { Field } from '../../../record-view/field'
import { Input } from '../../../primitives/input'
import { ImportSelect } from '../import-select'
import { text } from '../messages'
import type { FieldTexts } from './field-texts'
import type { ProposedField } from './table-proposal'

type FieldRowProps = {
  field: ProposedField
  /** The column's header, or its letters. */
  column: string
  /** Up to three values of its first rows. */
  examples: string[]
  problems?: { name?: string; label?: string }
  texts: FieldTexts
  onChange: (edit: Partial<Pick<ProposedField, 'include' | 'name' | 'label' | 'type'>>) => void
}

const leaveOut = ''

/**
 * A column of the file and the field it becomes: its type, only ever the one its cells say or a less specific one, or
 * left out, and its label and name.
 */
export const FieldRow = ({ field, column, examples, problems, texts, onChange }: FieldRowProps) => {
  const type = texts.field('type')
  const label = texts.field('label')
  const name = texts.field('name')
  const types = widerFieldTypes(field.inferred.type).map((value) => ({ value, label: texts.type(value) }))
  const decimal = field.include && field.type === 'decimal'
  return (
    <div className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-2 sm:gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{column}</p>
        <p className="truncate text-xs text-muted-foreground">{examples.length > 0 ? examples.join(', ') : text('emptyInFirstRows')}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <ImportSelect
          label={type.label}
          name={text('typeFor', { name: column })}
          value={field.include ? field.type : leaveOut}
          options={[...types, { value: leaveOut, label: text('doNotImport') }]}
          onChange={(value) => onChange(value === leaveOut ? { include: false } : { include: true, type: value as UserTableFieldType })}
          help={decimal ? text('decimalSize', { precision: field.decimal.precision, scale: field.decimal.scale }) : undefined}
        />
        {field.include && (
          <>
            <Field label={label.label} error={problems?.label} required>
              <Input wrapperClassName="max-sm:min-h-11" aria-label={text('labelFor', { name: column })} value={field.label} onChange={(event) => onChange({ label: event.target.value })} />
            </Field>
            <Field label={name.label} error={problems?.name} required>
              <Input wrapperClassName="max-sm:min-h-11" className="font-mono" aria-label={text('nameFor', { name: column })} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={field.name} onChange={(event) => onChange({ name: event.target.value })} />
            </Field>
          </>
        )}
      </div>
    </div>
  )
}
