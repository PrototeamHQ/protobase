import { checkFilter, evaluateFilter, parseFilter } from './filter'
import type { ActionInputKind, ActionInputModel, CheckedFilter, FieldModel, FieldType, JsonValue, ResourceModel } from './model'

/** @inline */
type InputOptions<D> = {
  label: string
  help?: string
  /** It may be left empty. */
  optional?: boolean
  /** An AIP-160 condition over the inputs before it, such as `plan = 'pro'`; it shows only while it holds. */
  when?: string
  /** What it holds when the dialog opens. */
  default?: D
}

const input = (name: string, kind: ActionInputKind, o: InputOptions<JsonValue>, extra: Partial<ActionInputModel> = {}): ActionInputModel => ({
  name,
  kind,
  label: o.label,
  required: kind !== 'boolean' && !o.optional,
  ...(o.help !== undefined && { help: o.help }),
  ...(o.when !== undefined && { when: o.when }),
  ...(o.default !== undefined && { default: o.default }),
  ...extra,
})

/** The builders `inputs: (i) => [...]` gets, one per kind of answer. */
export const inputs = {
  /** A line of text, or several with `multiline`; `max` is the most characters it may have. */
  text: (name: string, o: InputOptions<string> & { multiline?: boolean; max?: number }) =>
    input(name, 'text', o, { ...(o.multiline && { multiline: true }), ...(o.max !== undefined && { max: o.max }) }),
  /** A whole number; the handler gets a number. */
  integer: (name: string, o: InputOptions<number>) => input(name, 'integer', o),
  /** A number with decimals; the handler gets its text, as the API gives decimals, so no digit is lost. */
  decimal: (name: string, o: InputOptions<string>) => input(name, 'decimal', o),
  /** A switch; the handler gets `true` or `false`, so it is never required. */
  boolean: (name: string, o: { label: string; help?: string; when?: string; default?: boolean }) => input(name, 'boolean', o),
  /** A date as `YYYY-MM-DD`. */
  date: (name: string, o: InputOptions<string>) => input(name, 'date', o),
  /** One of `options`, each a value with its label, or a record of `resource`, whose key the handler gets. */
  choice: (name: string, o: InputOptions<string> & ({ options: Array<{ value: string; label: string }> } | { resource: string })) =>
    input(name, 'choice', o, 'options' in o ? { options: o.options.map(({ value, label }) => ({ value, label })) } : { resource: o.resource }),
  /**
   * What a project component edits, registered in `defineUi({ components })` under `component`: it gets the answer as
   * `value`, `onChange`, whether the answer is refused (`invalid`) and `props`.
   */
  custom: (name: string, o: InputOptions<JsonValue> & { component: string; props?: Record<string, JsonValue> }) =>
    input(name, 'custom', o, { component: o.component, ...(o.props !== undefined && { props: o.props }) }),
}

const filterTypes: Record<ActionInputKind, FieldType> = { text: 'text', integer: 'integer', decimal: 'decimal', boolean: 'boolean', date: 'date', choice: 'text', custom: 'json' }

const inputField = (entry: ActionInputModel): FieldModel => ({
  name: entry.name,
  column: entry.name,
  type: entry.options ? 'enum' : filterTypes[entry.kind],
  nullable: true,
  readOnly: false,
  filterable: entry.kind !== 'custom',
  sortable: false,
  aliases: [],
  ...(entry.options && { enumValues: entry.options.map((option) => option.value) }),
})

// The inputs as the fields of a resource, so `when` is checked and evaluated as a filter over a record of answers.
const answersModel = (entries: ActionInputModel[]): ResourceModel => ({
  name: 'inputs',
  table: { name: 'inputs' },
  fields: Object.fromEntries(entries.map((entry) => [entry.name, inputField(entry)])),
  primaryKey: [],
})

const checkedWhen = (entries: ActionInputModel[], index: number): CheckedFilter | string | undefined => {
  const source = entries[index]!.when
  if (source === undefined) return undefined
  const parsed = parseFilter(source)
  if (!parsed.ok) return parsed.errors.map((error) => error.message).join('; ')
  if (!parsed.ast) return 'it is empty'
  const checked = checkFilter(answersModel(entries.slice(0, index)), parsed.ast)
  return checked.ok ? checked.filter : checked.errors.map((error) => error.message).join('; ')
}

/** What is wrong with an action's inputs: a name given twice, a default that is no option, a `when` over no input before it. */
export const actionInputErrors = (entries: ActionInputModel[]) =>
  entries.flatMap((entry, index) => {
    const errors: string[] = []
    if (entries.findIndex((other) => other.name === entry.name) !== index) errors.push(`input "${entry.name}" is declared twice`)
    if (entry.options && entry.default !== undefined && !entry.options.some((option) => option.value === entry.default)) errors.push(`input "${entry.name}": default "${String(entry.default)}" is not one of its options`)
    const when = checkedWhen(entries, index)
    if (typeof when === 'string') errors.push(`input "${entry.name}": "when" is not a valid condition over the inputs before it: ${when}`)
    return errors
  })

/**
 * The names of the inputs that show for these answers, keyed by input name (null when empty): each input whose `when`
 * holds, reading the answer of an input that does not show as null.
 */
export const shownInputs = (entries: ActionInputModel[], answers: Record<string, unknown>) => {
  const shown = new Set<string>()
  const seen: Record<string, unknown> = {}
  entries.forEach((entry, index) => {
    const when = checkedWhen(entries, index)
    if (typeof when === 'string') throw new Error(`Input "${entry.name}": ${when}`)
    const visible = when === undefined || evaluateFilter(when, seen) === true
    if (visible) shown.add(entry.name)
    seen[entry.name] = visible ? (answers[entry.name] ?? null) : null
  })
  return shown
}
