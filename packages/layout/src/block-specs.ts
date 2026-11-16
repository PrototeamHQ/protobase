import type { BlockReads, ComponentReads, LayoutValue } from './node'
import { isLayoutNode } from './node'

// What each built-in block accepts at runtime, for trees written without TypeScript or built by hand. The types in
// blocks.ts say the same for the compiler.

type Kind = 'shown' | 'transValues' | 'transComponents' | 'choices' | 'sort' | 'filter' | 'pagination' | 'referenceLink' | 'text' | 'content' | 'texts' | 'integer' | 'elements' | 'values' | 'span' | 'columns' | 'format' | 'variant' | 'mode' | 'label' | 'amount' | 'scalar' | 'address' | 'chartType' | 'bucket' | 'range' | 'cardsLayout' | 'cardWidth' | 'pageWidth' | 'rowButton' | 'textAs' | 'boolean' | 'toolCalls' | 'tableColumns' | 'locales' | 'intlOptions' | 'dateFormat' | 'graphLayout' | 'graphDirection'

type PropSpec = { kind: Kind; required?: true }

export type { BlockReads }

/** A block's props and children, and what it reads: one read, or several, each a part of the plan named by its resource prop. */
export type BlockSpec = { props: Record<string, PropSpec>; children: boolean; reads?: ComponentReads }

const optional = (kind: Kind): PropSpec => ({ kind })
const required = (kind: Kind): PropSpec => ({ kind, required: true })

const heading = { title: optional('shown'), description: optional('shown'), actions: optional('elements') }
const data = { resource: required('text'), filter: optional('text'), sort: optional('text') }
const reads: BlockReads = { resource: 'resource', filter: 'filter', sort: 'sort' }
const listShape = { sort: optional('sort'), filter: optional('filter'), perPage: optional('integer') }
const inlineField = { source: required('text'), emptyText: optional('text') }
const intl = { locales: optional('locales'), options: optional('intlOptions') }

const specs: Record<string, BlockSpec> = {
  Page: { children: true, props: { title: required('shown'), description: optional('shown'), actions: optional('elements'), width: optional('pageWidth') } },
  Grid: { children: true, props: { columns: optional('columns'), span: optional('span') } },
  Card: { children: true, props: { ...heading, span: optional('span') } },
  Stat: {
    children: false,
    props: { label: required('shown'), value: optional('scalar'), resource: optional('text'), filter: optional('text'), field: optional('text'), format: optional('format'), description: optional('shown'), span: optional('span') },
    reads: { resource: 'resource', filter: 'filter' },
  },
  RecordCard: { children: true, props: { ...data, ...heading, recordKey: optional('text'), empty: optional('shown'), span: optional('span') }, reads },
  Field: { children: false, props: { source: required('text'), label: optional('label'), format: optional('format') } },
  Diff: { children: false, props: inlineField },
  // Without `resource`, it draws the list around it and reads nothing; its children draw the row `select` chose
  Table: { children: true, reads, props: { ...data, resource: optional('text'), ...heading, columns: optional('tableColumns'), button: optional('rowButton'), bulk: optional('boolean'), limit: optional('integer'), display: optional('text'), empty: optional('shown'), span: optional('span'), select: optional('text') } },
  SelectInput: { children: false, props: { source: required('text'), choices: optional('choices'), label: optional('shown'), defaultValue: optional('scalar') } },
  CardRow: { children: true, props: { ...data, ...heading, limit: optional('integer'), empty: optional('shown'), span: optional('span') }, reads },
  RecordRow: { children: false, props: { ...data, ...heading, limit: optional('integer'), display: optional('text'), empty: optional('shown'), span: optional('span') }, reads },
  RecordCards: {
    children: false,
    reads: { ...reads, fields: 'fields' },
    props: {
      ...data,
      ...heading,
      layout: optional('cardsLayout'),
      cardWidth: optional('cardWidth'),
      fields: optional('texts'),
      cardActions: optional('texts'),
      limit: optional('integer'),
      display: optional('text'),
      empty: optional('shown'),
      span: optional('span'),
    },
  },
  Chart: {
    children: false,
    reads: { resource: 'resource', filter: 'filter' },
    props: {
      ...heading,
      resource: required('text'),
      filter: optional('text'),
      groupBy: required('text'),
      splitBy: optional('text'),
      type: optional('chartType'),
      sum: optional('text'),
      average: optional('text'),
      granularity: optional('bucket'),
      range: optional('range'),
      limit: optional('integer'),
      empty: optional('shown'),
      span: optional('span'),
    },
  },
  // Its children draw the bar `select` chose
  Timeline: {
    children: true,
    reads: { resource: 'resource', filter: 'filter' },
    props: {
      ...heading,
      resource: required('text'),
      filter: optional('text'),
      lane: required('text'),
      bar: required('text'),
      start: required('text'),
      end: required('text'),
      color: required('text'),
      limit: optional('integer'),
      empty: optional('shown'),
      span: optional('span'),
      select: optional('text'),
    },
  },
  // Two reads, its nodes and its edges; its children draw the node `select` chose, and `node` each node
  Graph: {
    children: true,
    reads: [
      { resource: 'nodes', filter: 'filter', fields: ['label', 'group', 'status', 'x', 'y'], select: 'select' },
      { resource: 'edges', filter: 'edgeFilter', fields: ['source', 'target', 'edgeLabel', 'edgeStatus'] },
    ],
    props: {
      nodes: required('text'),
      edges: required('text'),
      source: required('text'),
      target: required('text'),
      label: required('text'),
      group: optional('text'),
      status: optional('text'),
      node: optional('elements'),
      filter: optional('text'),
      edgeFilter: optional('text'),
      edgeLabel: optional('text'),
      edgeStatus: optional('text'),
      animated: optional('text'),
      dashed: optional('text'),
      dotted: optional('text'),
      layout: optional('graphLayout'),
      direction: optional('graphDirection'),
      x: optional('text'),
      y: optional('text'),
      select: optional('text'),
      empty: optional('shown'),
    },
  },
  Progress: { children: false, props: { value: required('amount'), max: optional('amount'), label: optional('shown'), span: optional('span') } },
  ModalForm: {
    children: false,
    props: { mode: required('mode'), label: required('shown'), fields: required('texts'), resource: optional('text'), recordKey: optional('text'), title: optional('shown'), values: optional('values'), variant: optional('variant') },
  },
  Thread: {
    children: false,
    reads: { resource: 'resource', filter: 'filter' },
    props: { ...heading, resource: required('text'), filter: optional('text'), sender: optional('text'), time: required('text'), text: required('text'), status: optional('text'), working: optional('text'), calls: optional('toolCalls'), limit: optional('integer'), empty: optional('shown'), span: optional('span') },
  },
  Composer: { children: false, props: { resource: required('text'), field: required('text'), values: optional('values'), placeholder: optional('text'), span: optional('span') } },
  Image: { children: false, props: { function: optional('text'), src: optional('text'), alt: optional('text'), width: optional('integer'), height: optional('integer'), refresh: optional('integer') } },
  Action: { children: false, props: { name: required('text'), resource: optional('text'), label: optional('shown'), variant: optional('variant') } },
  ReferenceManyField: {
    children: true,
    reads: { resource: 'reference', filter: 'filter', sort: 'sort' },
    props: { reference: required('text'), target: required('text'), source: optional('text'), ...listShape, empty: optional('shown'), pagination: optional('pagination') },
  },
  ReferenceArrayField: { children: true, reads: { resource: 'reference', filter: 'filter', sort: 'sort' }, props: { source: required('text'), reference: required('text'), ...listShape, empty: optional('shown') } },
  ArrayField: { children: true, props: { source: required('text') } },
  RecordsIterator: { children: true, props: {} },
  ReferenceField: { children: true, reads: { resource: 'reference' }, props: { source: required('text'), reference: required('text'), link: optional('referenceLink'), empty: optional('shown') } },
  Show: { children: true, props: { when: required('text'), fallback: optional('content') } },
  Switch: { children: true, props: { fallback: optional('content') } },
  Match: { children: true, props: { when: required('text') } },
  Link: { children: true, props: { href: optional('text'), to: optional('address'), variant: optional('variant') } },
  Tabs: { children: true, props: {} },
  Tab: { children: true, props: { name: required('text'), label: required('shown') } },
  Settings: { children: false, props: { resource: required('text'), fields: optional('texts'), title: optional('shown'), description: optional('shown'), span: optional('span') } },
  Users: { children: false, props: {} },
  Profile: { children: false, props: {} },
  Password: { children: false, props: {} },
  Passkeys: { children: false, props: {} },
  TwoFactor: { children: false, props: {} },
  ConnectedAccounts: { children: false, props: {} },
  PersonalMail: { children: false, props: {} },
  Connections: { children: false, props: {} },
  Devices: { children: false, props: {} },
  ConnectedApps: { children: false, props: {} },
  PersonalAccessTokens: { children: false, props: {} },
  DeleteAccount: { children: false, props: {} },
  Box: { children: true, props: {} },
  // An email's own: its root, which the template gives, a button that opens a full address, and a rule
  Email: { children: true, props: {} },
  Button: { children: true, props: { href: required('text') } },
  Divider: { children: false, props: {} },
  Row: { children: true, props: {} },
  Column: { children: true, props: {} },
  Text: { children: true, props: { as: optional('textAs') } },
  // A text in the reader's language: its message by key, the values it formats and the elements its tags become
  Trans: { children: false, props: { i18nKey: required('text'), values: optional('transValues'), components: optional('transComponents') } },
  Details: { children: true, props: { open: optional('boolean') } },
  Summary: { children: true, props: {} },
  TextField: { children: false, props: inlineField },
  NumberField: { children: false, props: { ...inlineField, ...intl } },
  DateField: { children: false, props: { ...inlineField, ...intl, showDate: optional('boolean'), showTime: optional('boolean'), format: optional('dateFormat') } },
  BooleanField: { children: false, props: { ...inlineField, valueLabelTrue: optional('text'), valueLabelFalse: optional('text') } },
  UrlField: { children: false, props: { ...inlineField, content: optional('text') } },
  ChipField: { children: false, props: inlineField },
}

// Every built-in element takes Tailwind classes for its outer element.
export const blockSpecs: Record<string, BlockSpec> = Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name, { ...spec, props: { ...spec.props, className: optional('text') } }]))

const formats = ['relative', 'absolute', 'compact', 'percent', 'badge', 'code']
const variants = ['primary', 'secondary', 'danger', 'ghost']
const chartTypes = ['bar', 'line', 'donut']
const buckets = ['hour', 'day', 'week', 'month', 'year']
const ranges = ['7d', '30d', '90d', '1y', 'all']
const cardsLayouts = ['stack', 'carousel']
const cardWidths = ['1/4', '1/3', '1/2', '2/3']
const pageWidths = ['column', 'full']
const textTags = ['p', 'span', 'strong', 'em', 'h1', 'h2', 'h3', 'h4']

const oneOf = (values: string[]): [test: (value: LayoutValue) => boolean, expected: string] => [(value) => typeof value === 'string' && values.includes(value), values.join(', ')]

const isObject = (value: LayoutValue): value is Record<string, LayoutValue> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isRowButtonChoice = (value: LayoutValue | undefined) =>
  value !== undefined && isObject(value) && !isLayoutNode(value) && typeof value.label === 'string' && ((value.to !== undefined && isObject(value.to) && typeof value.to.kind === 'string') || typeof value.href === 'string')

const isToolCalls = (value: LayoutValue) =>
  isObject(value) &&
  !isLayoutNode(value) &&
  ['resource', 'name', 'time', 'status'].every((name) => typeof value[name] === 'string') &&
  ['filter', 'input', 'result', 'error'].every((name) => value[name] === undefined || typeof value[name] === 'string') &&
  Object.keys(value).every((name) => ['resource', 'filter', 'name', 'time', 'status', 'input', 'result', 'error'].includes(name))

const isTableColumn = (value: LayoutValue) =>
  typeof value === 'string' ||
  (isObject(value) && !isLayoutNode(value) && typeof value.name === 'string' && typeof value.priority === 'number' && Number.isInteger(value.priority) && value.priority > 0 && Object.keys(value).every((name) => name === 'name' || name === 'priority'))

// react-admin's choice, `{ id, name }`
const isChoice = (value: LayoutValue) => isObject(value) && !isLayoutNode(value) && (typeof value.id === 'string' || typeof value.id === 'number') && typeof value.name === 'string' && Object.keys(value).length === 2

// react-admin's `{ field, order }`, or AIP-132 text
const isSort = (value: LayoutValue) =>
  typeof value === 'string' || (isObject(value) && typeof value.field === 'string' && (value.order === 'ASC' || value.order === 'DESC') && Object.keys(value).length === 2)

// react-admin's object of equalities, each a scalar value, or AIP-160 text
const isTrans = (value: LayoutValue) => isLayoutNode(value) && value.type === 'Trans'

const isFilter = (value: LayoutValue) => typeof value === 'string' || (isObject(value) && !isLayoutNode(value) && Object.values(value).every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)))

const checks: Record<Kind, [test: (value: LayoutValue) => boolean, expected: string]> = {
  choices: [(value) => Array.isArray(value) && value.every(isChoice), "a list of choices, such as [{ id: '7d', name: 'Last 7 days' }]"],
  sort: [isSort, "an AIP-132 order such as 'created_at desc', or { field, order: 'ASC' | 'DESC' }"],
  filter: [isFilter, "an AIP-160 filter such as 'status = \"open\"', or an object of field values such as { status: 'open' }"],
  pagination: [(value) => value === 'more', "'more'"],
  referenceLink: [(value) => value === 'edit' || value === 'show' || value === false, "'edit', 'show' or false"],
  text: [(value) => typeof value === 'string', 'text'],
  shown: [(value) => typeof value === 'string' || isTrans(value), 'text, or a <Trans i18nKey="..." />'],
  transValues: [(value) => isObject(value) && !isLayoutNode(value) && Object.values(value).every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)), "values by name, such as { name: '{{title}}', count: 3 }"],
  // A tag's element holds the message's text inside the tag and nothing of its own, so it reads no data
  transComponents: [
    (value) => isObject(value) && !isLayoutNode(value) && Object.values(value).every((item) => isLayoutNode(item) && !item.custom && ['Text', 'Link', 'Button'].includes(item.type) && item.children.length === 0),
    'empty elements by tag name, each a <Text>, <Link> or <Button>, such as { b: <Text as="strong" /> }',
  ],
  content: [(value) => typeof value === 'string' || isLayoutNode(value) || (Array.isArray(value) && value.every(isLayoutNode)), 'text, an element or a list of elements'],
  boolean: [(value) => typeof value === 'boolean', 'true or false'],
  texts: [(value) => Array.isArray(value) && value.every((item) => typeof item === 'string'), 'a list of names'],
  integer: [(value) => typeof value === 'number' && Number.isInteger(value) && value > 0, 'a positive whole number'],
  elements: [(value) => isLayoutNode(value) || (Array.isArray(value) && value.every(isLayoutNode)), 'an element or a list of elements'],
  values: [(value) => isObject(value) && !isLayoutNode(value), 'an object of field values'],
  span: [(value) => value === 1 || value === 2 || value === 3 || value === 4, '1, 2, 3 or 4'],
  columns: [(value) => value === 1 || value === 2 || value === 3 || value === 4, '1, 2, 3 or 4'],
  format: [(value) => typeof value === 'string' && formats.includes(value), formats.join(', ')],
  variant: [(value) => typeof value === 'string' && variants.includes(value), variants.join(', ')],
  mode: [(value) => value === 'create' || value === 'edit', 'create or edit'],
  label: [(value) => typeof value === 'string' || isTrans(value) || value === false, 'text, a <Trans />, or false for none'],
  amount: [(value) => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)), 'a number or a field name'],
  scalar: [(value) => typeof value === 'string' || typeof value === 'number', 'text or a number'],
  chartType: oneOf(chartTypes),
  bucket: oneOf(buckets),
  range: oneOf(ranges),
  cardsLayout: oneOf(cardsLayouts),
  cardWidth: oneOf(cardWidths),
  pageWidth: oneOf(pageWidths),
  textAs: oneOf(textTags),
  address: [(value) => isObject(value) && !isLayoutNode(value) && typeof value.kind === 'string', "an address, such as { kind: 'list', resource: 'orders' }"],
  toolCalls: [isToolCalls, "tool calls, such as { resource: 'tool_calls', name: 'tool', time: 'called_at', status: 'status' }, also taking filter, input, result and error"],
  locales: [(value) => typeof value === 'string' || (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')), "a locale or a list of them, such as 'nl-NL'"],
  intlOptions: [
    (value) => isObject(value) && !isLayoutNode(value) && Object.values(value).every((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'),
    "Intl options, such as { style: 'currency', currency: 'EUR' }",
  ],
  dateFormat: oneOf(['relative']),
  graphLayout: oneOf(['layered', 'force']),
  graphDirection: oneOf(['down', 'right']),
  tableColumns: [(value) => Array.isArray(value) && value.every(isTableColumn), "a list of field names or { name, priority }, such as ['title', { name: 'status', priority: 1 }]"],
  rowButton: [
    (value) => (Array.isArray(value) ? value.length > 0 && value.every(isRowButtonChoice) : isRowButtonChoice(value)),
    "a button, such as { label: 'Open', to: { kind: 'record', resource: 'orders', key: '{{id}}' } } or { label: 'Report', href: '{{report_url}}' }, or a list of them",
  ],
}

/** Problems with one element's props and children against its block's spec. */
export const propProblems = (spec: BlockSpec, props: Record<string, LayoutValue>, childCount: number): string[] => {
  const allowed = Object.keys(spec.props)
  const unknown = Object.keys(props).filter((name) => !Object.hasOwn(spec.props, name)).map((name) => `unknown prop "${name}"; it takes ${allowed.join(', ')}`)
  const missing = Object.entries(spec.props).filter(([name, prop]) => prop.required && !Object.hasOwn(props, name)).map(([name]) => `"${name}" is required`)
  const wrong = Object.entries(props).flatMap(([name, value]) => {
    const prop = spec.props[name]
    if (!prop) return []
    const [test, expected] = checks[prop.kind]
    return test(value) ? [] : [`"${name}" must be ${expected}`]
  })
  const children = !spec.children && childCount > 0 ? ['takes no children'] : []
  return [...unknown, ...missing, ...wrong, ...children]
}
