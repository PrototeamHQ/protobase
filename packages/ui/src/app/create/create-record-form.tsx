import type { ReactNode } from 'react'
import { Field, Section } from '../../record-view'
import { Form } from './form'

export type CreateFormField = { name: string; label: string; help?: string; required?: boolean; error?: string; wide?: boolean; editor: ReactNode }

export type CreateFormSection = { title: string; help?: string; fields: CreateFormField[] }

export type CreateRecordFormProps = {
  noun: string
  collection: string
  sections: CreateFormSection[]
  saving: boolean
  /** A failure that belongs to no field. */
  message?: string
  onSubmit: () => void
  onCancel: () => void
}

/** The presentation of "New <thing>": the view's sections, each field with its editor, and Create or Cancel. */
export const CreateRecordForm = ({ noun, collection, sections, saving, message, onSubmit, onCancel }: CreateRecordFormProps) => (
  <Form
    title={`New ${noun.toLowerCase()}`}
    eyebrow={collection}
    submit={`Create ${noun.toLowerCase()}`}
    saving={saving}
    error={message ? new Error(message) : undefined}
    errorTitle="Not created"
    onSubmit={onSubmit}
    onCancel={onCancel}
  >
    {sections.map((section) => (
      <Section key={section.title} title={section.title} help={section.help}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          {section.fields.map((field) => (
            <Field key={field.name} label={field.label} required={field.required} help={field.help} error={field.error} wide={field.wide}>
              {field.editor}
            </Field>
          ))}
        </div>
      </Section>
    ))}
  </Form>
)
