import type { LayoutValue } from './node'
import { isLayoutNode } from './node'

// What each built-in block accepts at runtime, for trees written without TypeScript or built by hand. The types in
// blocks.ts say the same for the compiler.

type Kind = 'text' | 'texts' | 'integer' | 'elements' | 'values' | 'span' | 'columns' | 'format' | 'variant' | 'mode' | 'label' | 'amount' | 'scalar'

type PropSpec = { kind: Kind; required?: true }

export type BlockSpec = { props: Record<string, PropSpec>; children: boolean }

const optional = (kind: Kind): PropSpec => ({ kind })
const required = (kind: Kind): PropSpec => ({ kind, required: true })

const heading = { title: optional('text'), description: optional('text'), actions: optional('elements') }
const data = { resource: required('text'), filter: optional('text'), sort: optional('text') }

export const blockSpecs: Record<string, BlockSpec> = {
  Page: { children: true, props: { title: required('text'), description: optional('text'), actions: optional('elements') } },
  Grid: { children: true, props: { columns: optional('columns'), span: optional('span') } },
  Card: { children: true, props: { ...heading, span: optional('span') } },
  Stat: {
    children: false,
    props: { label: required('text'), value: optional('scalar'), resource: optional('text'), filter: optional('text'), field: optional('text'), format: optional('format'), description: optional('text'), span: optional('span') },
  },
  RecordCard: { children: true, props: { ...data, ...heading, recordKey: optional('text'), empty: optional('text'), span: optional('span') } },
  Field: { children: false, props: { name: required('text'), label: optional('label'), format: optional('format') } },
  Table: { children: false, props: { ...data, ...heading, columns: optional('texts'), pageSize: optional('integer'), empty: optional('text'), span: optional('span') } },
  CardRow: { children: true, props: { ...data, ...heading, limit: optional('integer'), empty: optional('text'), span: optional('span') } },
  Progress: { children: false, props: { value: required('amount'), max: optional('amount'), label: optional('text'), span: optional('span') } },
  ModalForm: {
    children: false,
    props: { mode: required('mode'), label: required('text'), fields: required('texts'), resource: optional('text'), recordKey: optional('text'), title: optional('text'), values: optional('values'), variant: optional('variant') },
  },
  Action: { children: false, props: { name: required('text'), resource: optional('text'), label: optional('text'), variant: optional('variant') } },
  Show: { children: true, props: { when: required('text') } },
  Link: { children: true, props: { href: required('text') } },
}

const formats = ['relative', 'absolute', 'compact', 'percent', 'badge', 'code']
const variants = ['primary', 'secondary', 'danger', 'ghost']

const isObject = (value: LayoutValue): value is Record<string, LayoutValue> => typeof value === 'object' && value !== null && !Array.isArray(value)

const checks: Record<Kind, [test: (value: LayoutValue) => boolean, expected: string]> = {
  text: [(value) => typeof value === 'string', 'text'],
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
