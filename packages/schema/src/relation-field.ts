import { Field } from './field'

/** `f.relation(resource)`: a field holding the key of a record of another resource. */
export class RelationField<V> extends Field<V> {
  /**
   * The columns that hold the other record's key, in the order of that key, for a resource with a key of several
   * columns. See [Keys and relations](docs/website/src/content/docs/reference/data-config.mdx#keys-and-relations).
   */
  columns(columns: string[]) {
    return this.with({ relation: { resource: this.meta.relation!.resource, columns } })
  }
}
