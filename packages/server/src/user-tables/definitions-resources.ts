import { f, resource, type AccessContext, type Ref } from '@protobase/schema'
import { maxLabelLength } from '@protobase/schema/internal'
import { definitionFieldTypes, definitionsSchema, maxOrganizationNameBytes, nameProblem, organizationColumn } from './names'
import { organizationAdmins } from './organization-access'

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
// With organizations, the organization's owners and admins, and superusers working in it, whatever the project's roles:
// each definition is its organization's, which `.tenant` keeps every query and create to.
const accessOf = (roles: boolean, organizations: boolean) =>
  organizations ? { list: organizationAdmins, read: organizationAdmins, create: organizationAdmins, update: organizationAdmins, delete: never }
  : roles ? { delete: never } : { list: admins, read: admins, create: admins, update: admins, delete: never }

// With organizations a definition and each of its fields carry the organization they were made in, which the server
// sets from the session and a request body may not.
const withOrganization = <T extends { tenant: (pick: (r: Record<string, Ref>) => Ref) => T }>(source: T, organizations: boolean) =>
  organizations ? source.tenant((r) => r[organizationColumn]!) : source

const issue = <F extends string>(field: F, problem: string | undefined) => (problem ? [{ field, message: problem }] : [])

/**
 * The definitions of the tables users add, as resources: a table at `/user_tables/<id>`, each of its fields at
 * `/user_table_fields/<table_id>,<name>`. Writing one creates its table or column in the database, in the same
 * transaction (`definitionsHook`). `taken` holds the names of the app's resources and those Protobase adds, which a
 * new table may not have. With `organizations`, each belongs to the organization it was made in and only that one's
 * owners and admins reach it; its table is `t<id>_<name>` (`table_name`), so the name is free in every organization.
 */
export const definitionsResources = ({ roles, taken, organizations = false }: { roles: boolean; taken: readonly string[]; organizations?: boolean }) => {
  // Typed as no field, so the builders' refs stay those of the fields every app has.
  const organization = (organizations ? { [organizationColumn]: f.text() } : {}) as {}
  const nameIssue = (name: unknown) => {
    if (organizations) return nameProblem(name, 'table', maxOrganizationNameBytes)
    return nameProblem(name, 'table') ?? (taken.includes(name as string) || [tablesResourceName, fieldsResourceName].includes(name as string) ? `"${name as string}" is the name of a resource of the app` : undefined)
  }
  const tables = resource(tablesResourceName)
    .table(`${definitionsSchema}.tables`)
    .fields({
      id: f.bigint().readOnly().dbDefault().filterable().sortable(),
      // Only partial indexes serve the name, one per organization or none, which the scan guard does not count, so it is
      // neither filtered nor sorted on.
      name: f.text().access(createOnly),
      singular_label: f.text().max(maxLabelLength),
      plural_label: f.text().max(maxLabelLength),
      title_field: f.text().optional(),
      version: f.bigint().readOnly().dbDefault(),
      // The table's name in the database and its resource's: the name, or `t<id>_<name>` with organizations.
      table_name: f.text().readOnly().dbDefault(),
      ...organization,
    })
    .primaryKey((r) => r.id)
    .explicitGrants()
    .access(accessOf(roles, organizations))
    .validate((table) => [
      ...issue('name', nameIssue(table.name)),
      ...issue('title_field', table.title_field ? nameProblem(table.title_field, 'field') : undefined),
    ])

  const fields = resource(fieldsResourceName)
    .table(`${definitionsSchema}.fields`)
    .fields({
      // The primary key (table_id, name) serves table_id, and the index (table_id, position) position with table_id
      // pinned; a list of every table's fields sorts by table_id first.
      table_id: f.relation(tablesResourceName).access(createOnly).filterable().sortable(),
      name: f.text().access(createOnly),
      label: f.text().max(maxLabelLength),
      type: f.enum(definitionFieldTypes).access(createOnly),
      // A column users add takes no value for the records already there, so no field is required.
      required: f.boolean().default(false).access(createOnly),
      position: f.integer().sortable(),
      precision: f.integer().optional().access(createOnly),
      scale: f.integer().optional().access(createOnly),
      ...organization,
    })
    .primaryKey((r) => [r.table_id, r.name])
    .explicitGrants()
    .access(accessOf(roles, organizations))
    .validate((field) => [
      ...issue('name', nameProblem(field.name, 'field')),
      ...issue('required', field.required ? 'A field users add is optional: the records already there have no value for it' : undefined),
      ...(field.type === 'decimal'
        ? [...issue('precision', field.precision == null || field.precision < 1 || field.precision > 1000 ? 'A decimal needs a precision from 1 to 1000' : undefined),
            ...issue('scale', field.scale == null || field.scale < 0 || (field.precision != null && field.scale > field.precision) ? 'A decimal needs a scale from 0 to its precision' : undefined)]
        : [...issue('precision', field.precision == null ? undefined : 'Only a decimal has a precision'), ...issue('scale', field.scale == null ? undefined : 'Only a decimal has a scale')]),
    ])

  return { tables: withOrganization(tables, organizations), fields: withOrganization(fields, organizations) }
}
