import type { ActionModel } from './model'

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
  /** Opens `href`: a path in the app or a URL; `{field}` is replaced by the record's value, such as `/orders/{orderId}`. */
  link: (name: string, o: Omit<ActionOptions, 'confirm'> & { href: string }): ActionModel => ({ ...named(name, o), run: { kind: 'link', href: o.href } }),
}
