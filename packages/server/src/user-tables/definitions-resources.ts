import { f, resource, type AccessContext } from '@protobase/schema'
import { definitionFieldTypes, definitionsSchema, nameProblem } from './names'

/** The names of the resources over the definitions: a table users add takes neither. */
export const tablesResourceName = 'user_tables'
export const fieldsResourceName = 'user_table_fields'

const admins = ({ user }: AccessContext) => user?.roles?.includes('admin') ?? false
const never = () => false

// What a field may not change once its column exists.
const createOnly = { update: never }

// With the project's roles an operation without a rule needs `<resource>.<action>`, which `.explicitGrants()` keeps
// from wildcards such as `*.create`, so only `*` or a capability naming the resource grants it; without roles, admins
// alone. Nothing deletes a definition: its table and columns stay.
const accessOf = (roles: boolean) => (roles ? { delete: never } : { list: admins, read: admins, create: admins, update: admins, delete: never })

const issue = <F extends string>(field: F, problem: string | undefined) => (problem ? [{ field, message: problem }] : [])

/**
 * The definitions of the tables users add, as resources: a table at `/user_tables/<id>`, each of its fields at
 * `/user_table_fields/<table_id>,<name>`. Writing one creates its table or column in the database, in the same
 * transaction (`definitionsHook`). `taken` holds the names of the app's resources and those Protobase adds, which a
 * new table may not have.
 */
export const definitionsResources = ({ roles, taken }: { roles: boolean; taken: readonly string[] }) => {
  const tables = resource(tablesResourceName)
    .table(`${definitionsSchema}.tables`)
    .fields({
      id: f.bigint().readOnly().dbDefault().filterable().sortable(),
      name: f.text().access(createOnly).filterable().sortable(),
      singular_label: f.text().max(200),
      plural_label: f.text().max(200),
      title_field: f.text().optional(),
      version: f.bigint().readOnly().dbDefault(),
    })
    .primaryKey((r) => r.id)
    .explicitGrants()
    .access(accessOf(roles))
    .validate((table) => [
      ...issue('name', nameProblem(table.name, 'table') ?? (taken.includes(table.name) || [tablesResourceName, fieldsResourceName].includes(table.name) ? `"${table.name}" is the name of a resource of the app` : undefined)),
      ...issue('title_field', table.title_field ? nameProblem(table.title_field, 'field') : undefined),
    ])

  const fields = resource(fieldsResourceName)
    .table(`${definitionsSchema}.fields`)
    .fields({
      table_id: f.relation(tablesResourceName).access(createOnly).filterable(),
      name: f.text().access(createOnly),
      label: f.text().max(200),
      type: f.enum(definitionFieldTypes).access(createOnly),
      // A column users add takes no value for the records already there, so no field is required.
      required: f.boolean().default(false).access(createOnly),
      position: f.integer().sortable(),
      precision: f.integer().optional().access(createOnly),
      scale: f.integer().optional().access(createOnly),
    })
    .primaryKey((r) => [r.table_id, r.name])
    .explicitGrants()
    .access(accessOf(roles))
    .validate((field) => [
      ...issue('name', nameProblem(field.name, 'field')),
      ...issue('required', field.required ? 'A field users add is optional: the records already there have no value for it' : undefined),
      ...(field.type === 'decimal'
        ? [...issue('precision', field.precision == null || field.precision < 1 || field.precision > 1000 ? 'A decimal needs a precision from 1 to 1000' : undefined),
            ...issue('scale', field.scale == null || field.scale < 0 || (field.precision != null && field.scale > field.precision) ? 'A decimal needs a scale from 0 to its precision' : undefined)]
        : [...issue('precision', field.precision == null ? undefined : 'Only a decimal has a precision'), ...issue('scale', field.scale == null ? undefined : 'Only a decimal has a scale')]),
    ])

  return { tables, fields }
}
