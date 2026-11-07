import { l, view } from '@protobase/schema'
import type { definitionsResources } from './definitions-resources'
import { fieldsResourceName, tablesResourceName } from './definitions-resources'
import type { DefinitionFieldType } from './names'

type Definitions = ReturnType<typeof definitionsResources>

/** What each field type is called in the admin app; the UI's locale files translate them. */
export const fieldTypeLabels: Record<DefinitionFieldType, string> = {
  text: 'Text',
  long_text: 'Long text',
  integer: 'Whole number',
  decimal: 'Decimal number',
  boolean: 'Yes or no',
  date: 'Date',
  timestamp: 'Date and time',
  json: 'JSON',
}

/**
 * The tables list of the admin app, for whoever may make tables: a table's page has its fields, a link to add one and a
 * link to the table's own list, which shows once the app serves it. The title field is set once its field exists. Its
 * Import makes a new table from a file, with its fields and records.
 */
export const tablesView = view<Definitions['tables']>(tablesResourceName)
  .names({ singular: 'Table', plural: 'Tables' })
  .title((r) => r.plural_label)
  .help('The tables people add to the app. Open one to give it fields or to go to its records.')
  .nav({ creatorsOnly: true, order: 0 })
  .import('table')
  .fields((r) => ({
    name: r.name.label('Name').format('code').help('Its address and the name of its database table: lowercase letters, digits and _, starting with a letter. It cannot change later.'),
    plural_label: r.plural_label.label('Plural label').help('Its name in the sidebar and above its list, such as Notes.'),
    singular_label: r.singular_label.label('Singular label').help('What one record is called, such as Note.'),
    title_field: r.title_field.label('Title field').notOnCreate().help('The name of the text field that titles each record and that search looks in.'),
  }))
  .list((r) => ({ columns: [r.plural_label, r.name], sort: [[r.id, 'asc']] }))
  .layout((r) => [
    l.section('Table', [r.plural_label, r.singular_label, r.name, r.title_field]),
    l.related('Fields', { resource: fieldsResourceName, field: 'table_id', columns: ['label', 'name', 'type'], sort: 'position', empty: 'No fields yet.' }),
  ])
  .actions((a) => [
    a.link('open_table', { label: 'Open table', icon: 'table', to: { kind: 'list', resource: '{table_name}' } }),
    a.link('add_field', { label: 'Add field', icon: 'plus', to: { kind: 'create', resource: fieldsResourceName, values: { table_id: '{id}' } } }),
  ])

/** A table's fields, reached from its page; a field users add is always optional, so its form leaves that out. */
export const fieldsView = view<Definitions['fields']>(fieldsResourceName)
  .names({ singular: 'Field', plural: 'Fields' })
  .title((r) => r.label)
  .nav({ hidden: true })
  .fields((r) => ({
    table_id: r.table_id.label('Table'),
    label: r.label.label('Label').help('What the field is called on screen.'),
    name: r.name.label('Name').format('code').help('Its name in the API and its database column: lowercase letters, digits and _, starting with a letter. It cannot change later.'),
    type: r.type.label('Type').valueLabels(fieldTypeLabels).help('What it holds. It cannot change later.'),
    position: r.position.label('Position').help('Where it sits among the fields of its table, 1 the first.'),
    precision: r.precision.label('Digits').help('For a decimal number only: how many digits it holds in all, from 1 to 1000.'),
    scale: r.scale.label('Decimals').help('For a decimal number only: how many of those digits come after the decimal point.'),
    required: r.required.notOnCreate(),
  }))
  .list((r) => ({ columns: [r.label, r.name, r.type, r.position], sort: [[r.table_id, 'asc'], [r.position, 'asc']] }))
  .layout((r) => [l.section('Field', [r.table_id, r.label, r.name, r.type, r.position]), l.section('Decimal number', [r.precision, r.scale])])
