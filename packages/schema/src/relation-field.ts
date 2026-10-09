import { Field } from './field'

export class RelationField<V> extends Field<V> {
  columns(columns: string[]) {
    return this.with({ relation: { resource: this.meta.relation!.resource, columns } })
  }
}
