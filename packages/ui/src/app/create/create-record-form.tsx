import type { ReactNode } from 'react'
import { Button } from '../../primitives/button'
import { Field, Section } from '../../record-view'
import { ErrorBanner } from '../error-banner'

export type CreateFormField = { name: string; label: string; help?: string; required?: boolean; error?: string; editor: ReactNode }

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
  <form
    className="min-h-0 flex-1 overflow-y-auto"
    onSubmit={(event) => {
      event.preventDefault()
      onSubmit()
    }}
  >
    <div className="mx-auto max-w-[760px] px-4 py-6 md:px-10 md:py-8">
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <p className="text-xs text-muted-foreground">{collection}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">New {noun.toLowerCase()}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button className="max-sm:min-h-11" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" type="submit" className="max-sm:min-h-11 max-sm:flex-1" loading={saving}>
            Create {noun.toLowerCase()}
          </Button>
        </div>
      </header>
      {message && (
        <div className="mt-4">
          <ErrorBanner title="Not created" error={new Error(message)} />
        </div>
      )}
      <div className="divide-y divide-border">
        {sections.map((section) => (
          <Section key={section.title} title={section.title} help={section.help}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {section.fields.map((field) => (
                <Field key={field.name} label={field.label} required={field.required} help={field.help} error={field.error}>
                  {field.editor}
                </Field>
              ))}
            </div>
          </Section>
        ))}
      </div>
    </div>
  </form>
)
