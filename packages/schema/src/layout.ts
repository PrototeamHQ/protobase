import type { LayoutItemModel, RelatedModel } from './model'
import type { Ref } from './refs'

export const layout = {
  section: (title: string, fields: Ref[], o: { help?: string } = {}): LayoutItemModel => ({
    kind: 'section',
    title,
    fields: fields.map((ref) => ref.name),
    ...(o.help !== undefined && { help: o.help }),
  }),
  sidebar: (fields: Ref[]): LayoutItemModel => ({
    kind: 'sidebar',
    fields: fields.map((ref) => ref.name),
  }),
  /** A table of the records of another resource that point at this one, directly or through a join table. */
  related: (title: string, o: Omit<RelatedModel, 'kind' | 'title'>): LayoutItemModel => ({ kind: 'related', title, ...structuredClone(o) }),
}
