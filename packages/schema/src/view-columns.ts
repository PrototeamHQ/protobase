import type { RelatedColumnModel } from './model'

/** A column of a view's list that is no field of the resource, as `c` makes one. */
export type ListColumn = RelatedColumnModel & {
  /** Marks a related records column. */
  readonly kind: 'related'
}

export const isListColumn = (value: unknown): value is ListColumn => typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'related'

export const columns = {
  /**
   * A column named `name` of the records of `resource` that point at each row, through its relation `field` or, with
   * `through`, through a join resource, as a related section's. Each record is a dot in the colour its `status` value
   * has in its view's `valueColors`, in `sort` order, and a link to the record, showing its card on hover or focus. The
   * name must not be a field of the resource. See
   * [Related records in a list](docs/website/src/content/docs/reference/ui-config.mdx#related-records-in-a-list).
   */
  related: (name: string, o: Omit<RelatedColumnModel, 'name'>): ListColumn => ({ kind: 'related', name, ...structuredClone(o) }),
}
