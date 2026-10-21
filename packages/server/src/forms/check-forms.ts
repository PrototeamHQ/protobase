import type { FieldType, FormModel, ViewModel } from '@protobase/schema'
import type { Registry } from '../registry'
import { requiredOnCreate } from '../validate-body'

/** A public form with the view that declares it. */
export type DeclaredForm = { form: FormModel; view: ViewModel }

// The fields the create form has an editor for, without a list to pick from or an upload: a visitor can read nothing and
// upload nothing.
const plainTypes: readonly FieldType[] = ['text', 'integer', 'bigint', 'decimal', 'boolean', 'date', 'enum', 'currency', 'country']

const fieldErrors = (registry: Registry, { form, view }: DeclaredForm, granted: readonly string[] | undefined) => {
  const entry = registry.find(view.resource)
  if (!entry) return []
  const { model } = entry
  if (!granted) return [`the anonymous role must grant creating its fields: { '${view.resource}.create': [${form.fields.map((name) => `'${name}'`).join(', ')}] }`]
  const fields = form.fields.flatMap((name) => {
    const field = model.fields[name]
    if (!field) return [`field "${name}" does not exist on ${view.resource}`]
    if (field.readOnly) return [`field "${name}" is read-only, so nobody fills it in`]
    if (field.sensitive && !field.encrypted) return [`field "${name}" is sensitive, and a public form takes only encrypted ones of them`]
    if (field.type === 'relation') return [`field "${name}" is a relation, whose records a visitor cannot read to pick one`]
    if (field.type === 'file') return [`field "${name}" is a file field, and a visitor cannot upload`]
    if (!plainTypes.includes(field.type)) return [`field "${name}" is ${field.type}, which a form has no input for`]
    if (name === model.tenant) return [`field "${name}" is the tenant, which the server sets`]
    if (!granted.includes(name)) return [`the anonymous role does not create "${name}": add it to { '${view.resource}.create': [...] }`]
    return []
  })
  const sources = entry.source.state.fields ?? {}
  const missing = Object.values(model.fields)
    .filter((field) => !field.readOnly && field.name !== model.tenant && !form.fields.includes(field.name))
    .filter((field) => sources[field.name] && requiredOnCreate(field, sources[field.name]!.schema))
    .map((field) => `it leaves out "${field.name}", which every create must give, so no submission could be saved`)
  return [...fields, ...missing]
}

/**
 * What stops startup about the public forms: a name two forms share, a resource that does not exist, and fields a
 * visitor cannot fill in, the anonymous role does not create, or that leave out a field the create needs. Identical forms
 * on several views of one resource, such as one view built on another, count as one. Returns the forms by name.
 */
export const checkForms = (registry: Registry, declared: readonly DeclaredForm[], anonymousCreates: (resource: string) => readonly string[] | undefined) => {
  const forms = new Map<string, DeclaredForm>()
  const problems: string[] = []
  for (const item of declared) {
    const { form, view } = item
    const where = `View "${view.resource}": form "${form.name}"`
    const taken = forms.get(form.name)
    if (taken) {
      const same = taken.view.resource === view.resource && JSON.stringify(taken.form) === JSON.stringify(form)
      if (!same) problems.push(`${where}: the name is taken by a form of ${taken.view.resource}; form names are unique across the app`)
      continue
    }
    forms.set(form.name, item)
    if (!registry.find(view.resource)) problems.push(`${where}: there is no resource "${view.resource}"`)
    problems.push(...fieldErrors(registry, item, anonymousCreates(view.resource)).map((problem) => `${where}: ${problem}`))
  }
  if (problems.length > 0) throw new Error(`The public forms cannot be served:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
  return forms
}
