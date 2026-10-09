import { z } from 'zod'
import type { FieldAccess } from './access/types'
import type { ResourceModel, SearchMatch } from './model'
import { buildResourceModel, ignoredColumns, type ResourceState } from './resource-model'
import type { Access, Issue, KeyRefs, RecordOf } from './resource-types'
import { createRefs, type FieldRefs, type FieldsInput, type Ref } from './refs'

type SearchRef = Ref & { readonly match?: SearchMatch }

/** A field picked for search; `digitsEnd()` matches only the end of its digits, ignoring spaces, `+` and dashes. */
type SearchRefs<F> = { readonly [K in keyof FieldRefs<F>]: FieldRefs<F>[K] & { digitsEnd(): SearchRef } }

type Validator<F> = (record: RecordOf<F>) => Issue<F>[] | undefined

export class ResourceBuilder<F extends FieldsInput = {}, K = never> {
  declare readonly $fields: F
  declare readonly $key: K

  constructor(
    readonly state: ResourceState,
    readonly validators: readonly Validator<F>[] = [],
    readonly accessRules: Access<F> = {},
  ) {}

  table(table: string) {
    return this.next({ table })
  }

  fields<const N extends FieldsInput>(fields: N) {
    return new ResourceBuilder<N>({ ...this.state, fields })
  }

  primaryKey<const P extends KeyRefs>(pick: (r: FieldRefs<F>) => P) {
    const picked = pick(this.refs())
    const refs: readonly Ref[] = Array.isArray(picked) ? picked : [picked]
    return new ResourceBuilder<F, P>(
      { ...this.state, primaryKey: refs.map((ref) => ref.name) },
      this.validators,
      this.accessRules,
    )
  }

  softDelete(pick: (r: FieldRefs<F>) => Ref) {
    return this.next({ softDelete: pick(this.refs()).name })
  }

  tenant(pick: (r: FieldRefs<F>) => Ref) {
    return this.next({ tenant: pick(this.refs()).name })
  }

  /**
   * Fields matched by `search("...")` and bare words in filters. Authoritative over the UI's list search defaults.
   * `r.phone.digitsEnd()` matches only the end of the field's digits, for phone numbers.
   */
  search(pick: (r: SearchRefs<F>) => SearchRef[]) {
    const refs = createRefs<SearchRefs<F>>((name) => ({ name, digitsEnd: () => ({ name, match: 'digitsEnd' }) }), this.knownFields())
    const picked = pick(refs)
    const searchMatch = Object.fromEntries(picked.flatMap((ref) => (ref.match ? [[ref.name, ref.match]] : [])))
    return this.next({ search: picked.map((ref) => ref.name), searchMatch })
  }

  /** The field holding the owning user's id, which `.own` capability scopes filter on. */
  owner(pick: (r: FieldRefs<F>) => Ref) {
    return this.next({ owner: pick(this.refs()).name })
  }

  validate(validator: Validator<F>) {
    return new ResourceBuilder<F, K>(this.state, [...this.validators, validator], this.accessRules)
  }

  access(rules: Access<F>) {
    return new ResourceBuilder<F, K>(this.state, this.validators, { ...this.accessRules, ...rules })
  }

  /** Role-based rules per field, for fields that declared `.access(...)`. */
  fieldAccess() {
    return Object.fromEntries(
      Object.entries(this.state.fields ?? {}).flatMap(([key, field]) => (field?.meta.access ? [[key, field.meta.access]] : [])),
    ) as Record<string, FieldAccess>
  }

  toModel(): ResourceModel {
    return buildResourceModel(this.state)
  }

  recordSchema() {
    const shape = Object.fromEntries(
      Object.entries(this.state.fields ?? {}).flatMap(([key, field]) =>
        field ? [[key, field.schema]] : [],
      ),
    )
    return z.object(shape) as unknown as z.ZodType<RecordOf<F>>
  }

  ignoredColumns() {
    return ignoredColumns(this.state.fields)
  }

  private refs() {
    return createRefs<FieldRefs<F>>((name) => ({ name }), this.knownFields())
  }

  private knownFields() {
    return Object.entries(this.state.fields ?? {})
      .filter(([, field]) => field !== null)
      .map(([key]) => key)
  }

  private next(patch: Partial<ResourceState>) {
    return new ResourceBuilder<F, K>({ ...this.state, ...patch }, this.validators, this.accessRules)
  }
}

export const resource = (name: string) => new ResourceBuilder({ name })
