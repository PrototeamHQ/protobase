import { f } from '../fields'
import { layout as l } from '../layout'
import { resource } from '../resource'
import { view } from '../view'

export const customStepKinds = ['container'] as const

// A custom step's manifest, in fields of their own, as a custom step and each of its versions keep it.
const manifestFields = {
  label: f.text().min(1).max(100),
  description: f.text().optional().max(2000),
  kind: f.enum(customStepKinds).dbDefault(),
  container: f.json(),
  input: f.json(),
  output: f.json(),
  error_prefix: f.text().dbDefault(),
  errors: f.json().dbDefault(),
}

/**
 * A step type the app's authors keep as a record: its manifest, checked on every save, each changed manifest a new
 * version that a workflow's Task names as `custom:<name>:<version>`. Its name is in every Task that calls it, so it is
 * set on create only. Creating, changing and deleting one are grants of their own.
 */
const customStepsResource = (schema: string) =>
  resource('workflow_custom_steps')
    .table(`${schema}.custom_steps`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      name: f.text().filterable().sortable().access({ update: () => false }),
      version: f.integer().readOnly().dbDefault(),
      ...manifestFields,
      tenant_id: f.text().optional().readOnly(),
      created_at: f.timestamp().readOnly().dbDefault(),
      updated_at: f.timestamp().readOnly().dbDefault().sortable(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .etagFrom((r) => r.updated_at)
    .search((r) => [r.name])
    .explicitGrants()

const customStepsView = view<ReturnType<typeof customStepsResource>>('workflow_custom_steps')
  .names({ singular: 'Custom step', plural: 'Custom steps' })
  .icon('package')
  .nav({ hidden: true })
  .title((r) => r.label)
  .help('A step type of your own, built from a Dockerfile, with the input it takes and the output it gives as JSON Schema. Each save that changes it is a new version, which a workflow names by its name and version, such as custom:invoice:2, so a change never alters a workflow that uses an earlier one.')
  .fields((r) => ({
    name: r.name.label('Name').help('The name a workflow\'s Task gives, such as invoice in custom:invoice:2: a lowercase letter, then lowercase letters, digits and "_". It cannot be changed once created'),
    label: r.label.label('Label'),
    description: r.description.label('Description'),
    kind: r.kind.label('Kind').valueLabels({ container: 'Container' }),
    container: r.container.label('Container').widget('custom_step_container').help('Its Dockerfile, the files beside it by their relative paths, which it copies, and the command it runs, the image\'s own without one'),
    input: r.input.label('Input').widget('json').help('The JSON Schema of the arguments it takes, an object; a property with x-file true takes a stored file'),
    output: r.output.label('Output').widget('json').help('The JSON Schema of what it gives, an object; a property with x-file true is a file it stores, in the storage configuration its store argument names'),
    error_prefix: r.error_prefix.label('Error prefix').help('The start of its error names, such as Invoice in Invoice.Refused'),
    errors: r.errors.label('Errors').widget('json').help('The errors it fails with, by name, each with what it means, such as Refused'),
    version: r.version.label('Version'),
    created_at: r.created_at.label('Created'),
    updated_at: r.updated_at.label('Updated'),
  }))
  .list((r) => ({ columns: [r.name, r.label, r.version, r.updated_at], sort: [[r.name, 'asc']] }))
  .layout((r) => [
    l.section('Custom step', [r.name, r.label, r.description, r.kind]),
    l.section('Manifest', [r.container, r.input, r.output, r.error_prefix, r.errors]),
    l.sidebar([r.version, r.created_at, r.updated_at]),
    l.related('Versions', { resource: 'workflow_custom_step_versions', field: 'custom_step_id', columns: ['version', 'saved_by', 'saved_at'] }),
  ])

/** Each version of a custom step's manifest, as it was saved. */
const customStepVersionsResource = (schema: string) =>
  resource('workflow_custom_step_versions')
    .table(`${schema}.custom_step_versions`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      custom_step_id: f.relation('workflow_custom_steps').optional().readOnly().filterable(),
      version: f.integer().readOnly().sortable().filterable(),
      name: f.text().readOnly(),
      label: f.text().readOnly(),
      description: f.text().optional().readOnly(),
      kind: f.enum(customStepKinds).readOnly(),
      container: f.json().readOnly(),
      input: f.json().readOnly(),
      output: f.json().readOnly(),
      error_prefix: f.text().readOnly(),
      errors: f.json().readOnly(),
      saved_by: f.text().optional().readOnly(),
      tenant_id: f.text().optional().readOnly(),
      saved_at: f.timestamp().readOnly().dbDefault(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ create: () => false, update: () => false, delete: () => false })

const customStepVersionsView = view<ReturnType<typeof customStepVersionsResource>>('workflow_custom_step_versions')
  .names({ singular: 'Custom step version', plural: 'Custom step versions' })
  .icon('history')
  .nav({ hidden: true })
  .title((r) => r.version)
  .fields((r) => ({
    custom_step_id: r.custom_step_id.label('Custom step'),
    kind: r.kind.label('Kind').valueLabels({ container: 'Container' }),
    container: r.container.label('Container').widget('custom_step_container'),
    input: r.input.label('Input').widget('json'),
    output: r.output.label('Output').widget('json'),
    errors: r.errors.label('Errors').widget('json'),
    error_prefix: r.error_prefix.label('Error prefix'),
    saved_by: r.saved_by.label('Saved by'),
    saved_at: r.saved_at.label('Saved'),
  }))
  .list((r) => ({ columns: [r.custom_step_id, r.version, r.saved_by, r.saved_at], sort: [[r.version, 'desc']] }))
  .layout((r) => [
    l.section('Custom step version', [r.custom_step_id, r.version, r.name, r.label, r.description, r.kind]),
    l.section('Manifest', [r.container, r.input, r.output, r.error_prefix, r.errors]),
    l.sidebar([r.saved_by, r.saved_at]),
    l.related('Builds', { resource: 'workflow_custom_step_builds', field: 'version_id', columns: ['status', 'runner_id', 'digest', 'started_at', 'finished_at'] }),
    l.related('Jobs', { resource: 'workflow_custom_step_jobs', field: 'version_id', columns: ['status', 'run_id', 'runner_id', 'queued_at', 'finished_at', 'error'] }),
  ])

/** The custom steps of the workflows over `schema`, with their versions, offered when the app turns custom steps on. */
export const customStepResources = (schema: string) => ({
  customSteps: customStepsResource(schema),
  customStepsView,
  customStepVersions: customStepVersionsResource(schema),
  customStepVersionsView,
})
