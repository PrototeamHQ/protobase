import { z } from 'zod'
import type { FieldAccess } from './access/types'
import { eventHelpers, type EventHelpers, type EventSpec } from './events/event-helpers'
import { eventMatches } from './events/event-models'
import type { ResourceModel, SearchMatch } from './model'
import { buildResourceModel, ignoredColumns, type ResourceState } from './resource-model'
import type { Access, Issue, KeyRefs, RecordOf } from './resource-types'
import { createRefs, type FieldRefs, type FieldsInput, type Ref } from './refs'

/** A field picked for search, with how it matches. */
export type SearchRef = Ref & {
  /** How it matches when not by containing the words; see {@link SearchMatch}. */
  readonly match?: SearchMatch
}

/** A field picked for search; `digitsEnd()` matches only the end of its digits, ignoring spaces, `+` and dashes. */
export type SearchRefs<F> = {
  readonly [K in keyof FieldRefs<F>]: FieldRefs<F>[K] & {
    /** Matches only the end of the field's digits, ignoring spaces, `+` and dashes, for phone numbers. */
    digitsEnd(): SearchRef
  }
}

/** A rule over a whole record for `.validate()`: the issues it finds, or `undefined` when there are none. */
export type Validator<F> = (record: RecordOf<F>) => Issue<F>[] | undefined

/**
 * A resource as `resource(name)` builds it. Every method returns a new builder, so a resource is one chain. See
 * [resource()](website/src/content/docs/reference/data-config.mdx#resource).
 */
export class ResourceBuilder<F extends FieldsInput = {}, K = never> {
  /** The fields, for the compiler only, which {@link InferRecord} reads; never set. */
  declare readonly $fields: F
  /** The fields of the key, for the compiler only, which {@link RecordKey} reads; never set. */
  declare readonly $key: K

  /** @internal */
  constructor(
    /** @internal */
    readonly state: ResourceState,
    /** @internal */
    readonly validators: readonly Validator<F>[] = [],
    /** @internal */
    readonly accessRules: Access<F> = {},
  ) {}

  /** The table, with or without its schema: `'shop.repairs'` or `'repairs'`. Required. */
  table(table: string) {
    return this.next({ table })
  }

  /**
   * The columns, by field name, each built with `f`. `name: null` ignores a column on purpose. The column is the
   * snake_case of the name unless `.column()` says otherwise. Required, and called before the methods that pick fields.
   */
  fields<const N extends FieldsInput>(fields: N) {
    return new ResourceBuilder<N>({ ...this.state, fields })
  }

  /** The key: one field, or a list for a key of several columns (`(r) => [r.order_id, r.line_no]`). Required. */
  primaryKey<const P extends KeyRefs>(pick: (r: FieldRefs<F>) => P) {
    const picked = pick(this.refs())
    const refs: readonly Ref[] = Array.isArray(picked) ? picked : [picked]
    return new ResourceBuilder<F, P>(
      { ...this.state, primaryKey: refs.map((ref) => ref.name) },
      this.validators,
      this.accessRules,
    )
  }

  /**
   * A nullable timestamp or date that marks a record deleted: deleting sets it, lists leave such rows out and
   * `:undelete` clears it.
   */
  softDelete(pick: (r: FieldRefs<F>) => Ref) {
    return this.next({ softDelete: pick(this.refs()).name })
  }

  /**
   * The field that separates tenants: every query is limited to the caller's tenant, creates set it, and a request body
   * may not.
   */
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

  /**
   * The events changes to its records raise, captured in the database for every write, from the API or elsewhere. See
   * [Declaring events](website/src/content/docs/reference/events.mdx#declaring-events).
   *
   * @example
   * ```ts
   * .events((e, r) => [
   *   ...e.crud(),
   *   e.becomes('large', 'total > 1000'),
   *   e.updated('statusChanged', { changed: [r.status] }),
   *   e.updated('reopened', { from: 'status = "cancelled"', when: 'status != "cancelled"' }),
   * ])
   * ```
   */
  events(define: (e: EventHelpers<RecordOf<F>>, r: FieldRefs<F>) => EventSpec[]) {
    return this.next({ events: define(eventHelpers<RecordOf<F>>(), this.refs()) })
  }

  /**
   * Keeps every change of its records, from the API or elsewhere: the fields before and after, and who made it. The
   * record page shows it as History, and admins list every change as Activity. See
   * [Record history](website/src/content/docs/reference/history.mdx).
   */
  history() {
    return this.next({ history: true })
  }

  /** The code predicates (`match`) of its events, by event name. */
  eventMatches() {
    return eventMatches(this.toModel(), this.state.events ?? [])
  }

  /**
   * A rule over the whole record, run after the field checks on every create and update. Its issues answer `400` with
   * the field named. Each call adds a rule.
   *
   * @example
   * ```ts
   * .validate((repair) => (repair.status === 'collected' && !repair.paid ? [{ field: 'paid', message: 'A bike leaves the shop paid' }] : undefined))
   * ```
   */
  validate(validator: Validator<F>) {
    return new ResourceBuilder<F, K>(this.state, [...this.validators, validator], this.accessRules)
  }

  /**
   * Rules per operation (`list`, `read`, `create`, `update`, `delete`). A rule returns `true`, `false`, or a filter that
   * limits the rows. An operation without a rule needs its capability when the app has roles. See
   * [Access](website/src/content/docs/reference/access.mdx).
   *
   * @example
   * ```ts
   * .access({
   *   read: roles.can('work_orders.read'),
   *   update: roles.can('work_orders.update').and((_ctx, record) => (record as { status: string }).status !== 'done'),
   *   delete: roles.is('admin'),
   * })
   * ```
   */
  access(rules: Access<F>) {
    return new ResourceBuilder<F, K>(this.state, this.validators, { ...this.accessRules, ...rules })
  }

  /** Role-based rules per field, for fields that declared `.access(...)`. */
  fieldAccess() {
    return Object.fromEntries(
      Object.entries(this.state.fields ?? {}).flatMap(([key, field]) => (field?.meta.access ? [[key, field.meta.access]] : [])),
    ) as Record<string, FieldAccess>
  }

  /** The resource as the server and the app read it. Throws when the table, fields or key are missing, or a field option conflicts with another. */
  toModel(): ResourceModel {
    return buildResourceModel(this.state)
  }

  /** The Zod schema of a whole record, from its fields' schemas. */
  recordSchema() {
    const shape = Object.fromEntries(
      Object.entries(this.state.fields ?? {}).flatMap(([key, field]) =>
        field ? [[key, field.schema]] : [],
      ),
    )
    return z.object(shape) as unknown as z.ZodType<RecordOf<F>>
  }

  /** The columns of the fields given as `null`, which the resource ignores on purpose. */
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

/**
 * A resource: one table of an existing database, its columns as fields, its key and the rules around it. `name` is its
 * address (`/api/v1/<name>`) and how other config refers to it. See
 * [Data config](website/src/content/docs/reference/data-config.mdx).
 *
 * @example
 * ```ts
 * export const customers = resource('customers')
 *   .table('shop.customers')
 *   .fields({
 *     id: f.integer().readOnly().filterable().sortable().dbDefault(),
 *     name: f.text().min(2).filterable().sortable(),
 *     email: f.text().optional().filterable(),
 *   })
 *   .primaryKey((r) => r.id)
 *   .search((r) => [r.name, r.email])
 * ```
 */
export const resource = (name: string) => new ResourceBuilder({ name })
