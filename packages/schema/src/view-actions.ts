import { actionInputErrors, inputs } from './action-inputs'
import { linkActionError } from './address-template'
import { promptError } from './ai-prompt'
import type { ActionInputModel, ActionModel, AppAddress } from './model'

/** @inline */
type ActionOptions = { label: string; icon?: string; confirm?: string }

const named = (name: string, o: ActionOptions & { bulk?: boolean }): ActionModel => ({
  name,
  label: o.label,
  bulk: o.bulk ?? false,
  ...(o.icon !== undefined && { icon: o.icon }),
  ...(o.confirm !== undefined && { confirm: o.confirm }),
})

export const actions = {
  /**
   * An action the app implements: it runs the handler registered under `name`. With `inputs`, such as
   * `(i) => [i.text('reason', { label: 'Reason' })]`, the button first asks for them in a dialog, and the handler gets the
   * answers as `values`.
   */
  action: (name: string, o: ActionOptions & { bulk?: boolean; inputs?: (i: typeof inputs) => ActionInputModel[] }): ActionModel => {
    if (!o.inputs) return named(name, o)
    const built = o.inputs(inputs)
    const errors = actionInputErrors(built)
    if (errors.length > 0) throw new Error(`Action "${name}": ${errors.join('; ')}`)
    return { ...named(name, o), inputs: built }
  },
  /**
   * Sets fields of the record, as one update with its ETag, for example `{ status: 'paid' }`. It is not offered on a
   * record that holds these values already.
   */
  update: (name: string, o: ActionOptions & { set: Record<string, unknown> }): ActionModel => ({ ...named(name, o), run: { kind: 'update', values: o.set } }),
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
  },  /**
   * Has the model write the `writes` field of the record from `prompt`, `{field}` replaced by the record's values, as the
   * user who clicks; see [AI fields and actions](website/src/content/docs/reference/ai.mdx). The prompt may name the
   * field it writes, to rewrite or translate it in place.
   */
  ai: (name: string, o: ActionOptions & { prompt: string; writes: string }): ActionModel => {
    const error = promptError(o.prompt) ?? (o.writes === '' ? 'it writes no field' : undefined)
    if (error) throw new Error(`Action "${name}": ${error}`)
    return { ...named(name, o), run: { kind: 'ai', prompt: o.prompt, writes: o.writes } }
  },
}
