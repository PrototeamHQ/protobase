import type { LayoutValue } from './node'
import { isLayoutNode } from './node'

// What each built-in block accepts at runtime, for trees written without TypeScript or built by hand. The types in
// blocks.ts say the same for the compiler.

type Kind = 'sort' | 'filter' | 'pagination' | 'referenceLink' | 'text' | 'content' | 'texts' | 'integer' | 'elements' | 'values' | 'span' | 'columns' | 'format' | 'variant' | 'mode' | 'label' | 'amount' | 'scalar' | 'address' | 'chartType' | 'bucket' | 'range' | 'cardsLayout' | 'cardWidth' | 'pageWidth' | 'rowButton' | 'textAs' | 'boolean' | 'toolCalls' | 'tableColumns'

type PropSpec = { kind: Kind; required?: true }

/**
 * Which props of a block that reads records name what it reads: the resource, its filter and its sort, so a page's reads
 * can be planned from the tree. A block without one reads nothing of its own.
 */
export type BlockReads = { resource: string; filter?: string; sort?: string; fields?: string }

export type BlockSpec = { props: Record<string, PropSpec>; children: boolean; reads?: BlockReads }

const optional = (kind: Kind): PropSpec => ({ kind })
const required = (kind: Kind): PropSpec => ({ kind, required: true })

const heading = { title: optional('text'), description: optional('text'), actions: optional('elements') }
const data = { resource: required('text'), filter: optional('text'), sort: optional('text') }
const reads: BlockReads = { resource: 'resource', filter: 'filter', sort: 'sort' }
const listShape = { sort: optional('sort'), filter: optional('filter'), perPage: optional('integer') }

const specs: Record<string, BlockSpec> = {
  Page: { children: true, props: { title: required('text'), description: optional('text'), actions: optional('elements'), width: optional('pageWidth') } },
  Grid: { children: true, props: { columns: optional('columns'), span: optional('span') } },
  Card: { children: true, props: { ...heading, span: optional('span') } },
  Stat: {
    children: false,
    props: { label: required('text'), value: optional('scalar'), resource: optional('text'), filter: optional('text'), field: optional('text'), format: optional('format'), description: optional('text'), span: optional('span') },
    reads: { resource: 'resource', filter: 'filter' },
  },
  RecordCard: { children: true, props: { ...data, ...heading, recordKey: optional('text'), empty: optional('text'), span: optional('span') }, reads },
  Field: { children: false, props: { name: required('text'), label: optional('label'), format: optional('format') } },
  // Without `resource`, it draws the list around it and reads nothing
  Table: { children: false, reads, props: { ...data, resource: optional('text'), ...heading, columns: optional('tableColumns'), button: optional('rowButton'), bulk: optional('boolean'), limit: optional('integer'), display: optional('text'), empty: optional('text'), span: optional('span') } },
  CardRow: { children: true, props: { ...data, ...heading, limit: optional('integer'), empty: optional('text'), span: optional('span') }, reads },
  RecordRow: { children: false, props: { ...data, ...heading, limit: optional('integer'), display: optional('text'), empty: optional('text'), span: optional('span') }, reads },
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
      empty: optional('text'),
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
      empty: optional('text'),
      span: optional('span'),
    },
  },
  Progress: { children: false, props: { value: required('amount'), max: optional('amount'), label: optional('text'), span: optional('span') } },
  ModalForm: {
    children: false,
    props: { mode: required('mode'), label: required('text'), fields: required('texts'), resource: optional('text'), recordKey: optional('text'), title: optional('text'), values: optional('values'), variant: optional('variant') },
  },
  Thread: {
    children: false,
    reads: { resource: 'resource', filter: 'filter' },
    props: { ...heading, resource: required('text'), filter: optional('text'), sender: required('text'), time: required('text'), text: required('text'), status: optional('text'), working: optional('text'), calls: optional('toolCalls'), limit: optional('integer'), empty: optional('text'), span: optional('span') },
  },
  Composer: { children: false, props: { resource: required('text'), field: required('text'), values: optional('values'), placeholder: optional('text'), span: optional('span') } },
  Image: { children: false, props: { function: optional('text'), src: optional('text'), alt: optional('text'), width: optional('integer'), height: optional('integer'), refresh: optional('integer') } },
  Action: { children: false, props: { name: required('text'), resource: optional('text'), label: optional('text'), variant: optional('variant') } },
  ReferenceManyField: {
    children: true,
    reads: { resource: 'reference', filter: 'filter', sort: 'sort' },
    props: { reference: required('text'), target: required('text'), source: optional('text'), ...listShape, empty: optional('text'), pagination: optional('pagination') },
  },
  ReferenceArrayField: { children: true, reads: { resource: 'reference', filter: 'filter', sort: 'sort' }, props: { source: required('text'), reference: required('text'), ...listShape } },
  ArrayField: { children: true, props: { source: required('text') } },
  RecordsIterator: { children: true, props: {} },
  ReferenceField: { children: true, reads: { resource: 'reference' }, props: { source: required('text'), reference: required('text'), link: optional('referenceLink'), emptyText: optional('text') } },
  Show: { children: true, props: { when: required('text'), fallback: optional('content') } },
  Switch: { children: true, props: { fallback: optional('content') } },
  Match: { children: true, props: { when: required('text') } },
  Link: { children: true, props: { href: optional('text'), to: optional('address'), variant: optional('variant') } },
  Tabs: { children: true, props: {} },
  Tab: { children: true, props: { name: required('text'), label: required('text') } },
  Settings: { children: false, props: { resource: required('text'), fields: optional('texts'), title: optional('text'), description: optional('text'), span: optional('span') } },
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
  Row: { children: true, props: {} },
  Column: { children: true, props: {} },
  Text: { children: true, props: { as: optional('textAs') } },
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
const textTags = ['p', 'span', 'h1', 'h2', 'h3', 'h4']

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

// react-admin's `{ field, order }`, or AIP-132 text
const isSort = (value: LayoutValue) =>
  typeof value === 'string' || (isObject(value) && typeof value.field === 'string' && (value.order === 'ASC' || value.order === 'DESC') && Object.keys(value).length === 2)

// react-admin's object of equalities, each a scalar value, or AIP-160 text
const isFilter = (value: LayoutValue) => typeof value === 'string' || (isObject(value) && !isLayoutNode(value) && Object.values(value).every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)))

const checks: Record<Kind, [test: (value: LayoutValue) => boolean, expected: string]> = {
  sort: [isSort, "an AIP-132 order such as 'created_at desc', or { field, order: 'ASC' | 'DESC' }"],
  filter: [isFilter, "an AIP-160 filter such as 'status = \"open\"', or an object of field values such as { status: 'open' }"],
  pagination: [(value) => value === 'more', "'more'"],
  referenceLink: [(value) => value === 'edit' || value === 'show' || value === false, "'edit', 'show' or false"],
  text: [(value) => typeof value === 'string', 'text'],
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
  label: [(value) => typeof value === 'string' || value === false, 'text, or false for none'],
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
