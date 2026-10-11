import { appHrefError } from './address-template'
import type { ActionModel, AppAddress } from './model'

type ActionOptions = { label: string; icon?: string; confirm?: string }

const named = (name: string, o: ActionOptions & { bulk?: boolean }): ActionModel => ({
  name,
  label: o.label,
  bulk: o.bulk ?? false,
  ...(o.icon !== undefined && { icon: o.icon }),
  ...(o.confirm !== undefined && { confirm: o.confirm }),
})

export const actions = {
  /** An action the app implements: it runs the handler registered under `name`. */
  action: (name: string, o: ActionOptions & { bulk?: boolean }): ActionModel => named(name, o),
  /** Sets fields of the record, as one update with its ETag, for example `{ status: 'paid' }`. */
  update: (name: string, o: ActionOptions & { set: Record<string, unknown> }): ActionModel => ({ ...named(name, o), run: { kind: 'update', values: o.set } }),
  /** Deletes the record (soft delete when the resource has one). */
  remove: (name: string, o: ActionOptions): ActionModel => ({ ...named(name, o), run: { kind: 'delete' } }),
  /**
   * Goes `to` an address in the app, such as `{ kind: 'record', resource: 'orders', key: '{order_id}' }`, or opens an
   * `href` that leaves it (`https:`, `mailto:`); `{field}` is replaced by the record's value. A path in the app is
   * refused as an `href`, so every address in the app is written one way.
   */
  link: (name: string, o: Omit<ActionOptions, 'confirm'> & ({ to: AppAddress } | { href: string })): ActionModel => {
    if ('to' in o) return { ...named(name, o), run: { kind: 'link', to: structuredClone(o.to) } }
    const error = appHrefError(o.href)
    if (error) throw new Error(`Action "${name}": ${error}`)
    return { ...named(name, o), run: { kind: 'link', href: o.href } }
  },
}
