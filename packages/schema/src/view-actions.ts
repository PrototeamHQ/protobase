import { actionInputErrors, inputs } from './action-inputs'
import { linkActionError } from './address-template'
import { promptError } from './ai-prompt'
import { updateSetErrors } from './update-set'
import type { ActionInputModel, ActionModel, AppAddress } from './model'

/**
 * A button's label, icon and question, and the records it applies to: `when`, an AIP-160 condition over the record's own
 * fields such as `status = 'running'`, leaves the button out on a record it does not hold for, or with
 * `otherwise: 'disable'` shows it disabled with `reason`. `variant: 'danger'` draws it in red.
 * @inline
 */
type ActionOptions = { label: string; icon?: string; confirm?: string; when?: string; otherwise?: 'hide' | 'disable'; reason?: string; variant?: 'danger' }

/** What is wrong with an action's `when`, `otherwise` and `reason`: a fallback needs a condition, and a disabled button says why. */
export const actionConditionError = (o: Pick<ActionOptions, 'when' | 'otherwise' | 'reason'>) => {
  if (o.when === undefined) return o.otherwise !== undefined || o.reason !== undefined ? '"otherwise" and "reason" need a "when" condition' : undefined
  if (o.when.trim() === '') return '"when" is empty'
  if (o.otherwise === 'disable') return o.reason ? undefined : 'a button disabled by "when" needs a "reason"'
  return o.reason === undefined ? undefined : '"reason" shows only with otherwise: \'disable\''
}

const named = (name: string, o: ActionOptions & { bulk?: boolean }): ActionModel => {
  const error = actionConditionError(o)
  if (error) throw new Error(`Action "${name}": ${error}`)
  return {
    name,
    label: o.label,
    bulk: o.bulk ?? false,
    ...(o.icon !== undefined && { icon: o.icon }),
    ...(o.confirm !== undefined && { confirm: o.confirm }),
    ...(o.when !== undefined && { when: o.when }),
    ...(o.otherwise === 'disable' && { otherwise: o.otherwise, reason: o.reason }),
    ...(o.variant !== undefined && { variant: o.variant }),
  }
}

/** @inline */
type InputsOption = { inputs?: (i: typeof inputs) => ActionInputModel[] }

// The inputs an action asks for, built and checked once for every action that takes them.
const builtInputs = (name: string, option: InputsOption['inputs']) => {
  if (!option) return {}
  const built = option(inputs)
  const errors = actionInputErrors(built)
  if (errors.length > 0) throw new Error(`Action "${name}": ${errors.join('; ')}`)
  return { inputs: built }
}

export const actions = {
  /**
   * An action the app implements: it runs the handler registered under `name`. With `inputs`, such as
   * `(i) => [i.text('reason', { label: 'Reason' })]`, the button first asks for them in a dialog, and the handler gets the
   * answers as `values`. With `bulk` and no `inputs`, the list offers it for the selected rows too, and runs the handler on each it applies to.
   */
  action: (name: string, o: ActionOptions & InputsOption & { bulk?: boolean }): ActionModel => ({ ...named(name, o), ...builtInputs(name, o.inputs) }),
  /**
   * Sets fields of the record, as one update with its ETag, for example `{ status: 'paid' }`. It is not offered on a
   * record that holds these values already. With `inputs`, the button first asks for them in a dialog, and a `set` value
   * that is exactly `'{name}'` is written as that input's answer, with no handler code:
   * `a.update('answer', { label: 'Answer', inputs: (i) => [i.text('answer', { label: 'Answer', multiline: true })], set: { answer: '{answer}' } })`.
   * With `bulk` and no `inputs`, the list offers it for the selected rows too, and updates each it applies to.
   */
  update: (name: string, o: ActionOptions & InputsOption & { set: Record<string, unknown>; bulk?: boolean }): ActionModel => {
    const built = builtInputs(name, o.inputs)
    const errors = updateSetErrors(o.set, built.inputs)
    if (errors.length > 0) throw new Error(`Action "${name}": ${errors.join('; ')}`)
    return { ...named(name, o), ...built, run: { kind: 'update', values: o.set } }
  },
  /** Deletes the record (soft delete when the resource has one). */
  remove: (name: string, o: ActionOptions): ActionModel => ({ ...named(name, o), run: { kind: 'delete' } }),
  /**
   * Goes `to` an address in the app, such as `{ kind: 'record', resource: 'orders', key: '{order_id}' }`, or opens an
   * `href` that leaves it (`https:`, `mailto:`); `{field}` is replaced by the record's value. An `https:` or `http:` link
   * opens in a new tab without the referrer. An href that is only `{field}`, such as `'{website}'`, opens the URL the
   * record holds, and the button shows only when it is an `https:` or `http:` URL; `{host}` in the label becomes its host,
   * as in `'View on {host}'`. A path in the app is refused as an `href`, so every address in the app is written one way.
   */
  link: (name: string, o: Omit<ActionOptions, 'confirm'> & ({ to: AppAddress } | { href: string })): ActionModel => {
    const error = linkActionError(o.label, o)
    if (error) throw new Error(`Action "${name}": ${error}`)
    if ('to' in o) return { ...named(name, o), run: { kind: 'link', to: structuredClone(o.to) } }
    return { ...named(name, o), run: { kind: 'link', href: o.href } }
  },
  /**
   * Has the model write the `writes` field of the record from `prompt`, `{field}` replaced by the record's values, as the
   * user who clicks; see [AI fields and actions](docs/website/src/content/docs/reference/ai.mdx). The prompt may name the
   * field it writes, to rewrite or translate it in place.
   */
  ai: (name: string, o: ActionOptions & { prompt: string; writes: string }): ActionModel => {
    const error = promptError(o.prompt) ?? (o.writes === '' ? 'it writes no field' : undefined)
    if (error) throw new Error(`Action "${name}": ${error}`)
    return { ...named(name, o), run: { kind: 'ai', prompt: o.prompt, writes: o.writes } }
  },
}
