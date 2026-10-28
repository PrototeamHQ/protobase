import { z } from 'zod'
import type { FieldAccess } from './access/types'
import { eventHelpers, type EventHelpers, type EventSpec } from './events/event-helpers'
import { eventMatches } from './events/event-models'
import type { ComputedReveal } from './computed/computed-reveal'
import type { ParentAccess, PositionAfterModel, ResourceModel, SearchMatch } from './model'
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

/** How `.tenant()` separates tenants. */
export type TenantOptions = {
  /**
   * `memberships`: lists also read every other tenant the caller is a member of, each with the caller's role there,
   * so the tenant field works as a filter across them. A record's own reads and every write stay in the caller's tenant.
   */
  across?: 'memberships'
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
    /** @internal */
    readonly computedReveals: Readonly<Record<string, ComputedReveal<RecordOf<F>>>> = {},
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
      this.computedReveals,
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
   * may not. With `across: 'memberships'`, its lists also read the other tenants the caller is a member of, each as the
   * caller's role there allows; see [Lists across organizations](website/src/content/docs/reference/access.mdx#lists-across-organizations).
   */
  tenant(pick: (r: FieldRefs<F>) => Ref, options: TenantOptions = {}) {
    return this.next({ tenant: pick(this.refs()).name, ...(options.across && { tenantAcross: options.across }) })
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
   * A unique key of the table, as its fields, whose conflict on create opens the record already holding those values:
   * the API's 409 names that record's key (`existing.key`) to a caller who may read it, and the create form opens it.
   * The fields must be exactly the columns of a unique index or constraint, such as one over a generated column. See
   * [Opening an existing record](website/src/content/docs/reference/data-config.mdx#opening-an-existing-record).
   *
   * @example
   * ```ts
   * .openExisting((r) => [r.organization_id, r.member_key])
   * ```
   */
  openExisting(pick: (r: FieldRefs<F>) => Ref[]) {
    return this.next({ openExisting: pick(this.refs()).map((ref) => ref.name) })
  }

  /**
   * The field holding the id of the user who created the record, such as a chat message's sender: every create sets it
   * to the signed-in user's id, and no request may write it, so it is never the client's word. A create by no user
   * leaves it empty.
   *
   * @example
   * ```ts
   * .author((r) => r.author_id)
   * ```
   */
  author(pick: (r: FieldRefs<F>) => Ref) {
    return this.next({ author: pick(this.refs()).name })
  }

  /**
   * The integer field holding the records' order, 1 the first, which a list's **Reorder** button changes by dragging the
   * records; a move renumbers them 1, 2, 3, ... in one batch `reorder`. With `within`, a relation, each parent's records
   * have an order of their own, as an invoice's items do, sorted in the parent's related section. The field must be
   * sortable and `within` filterable. With `after`, a record never ranks above the records it depends on through a join
   * resource (see {@link PositionAfterModel}), which `reorder` checks. See
   * [Reordering by hand](website/src/content/docs/reference/ui-config.mdx#reordering-by-hand).
   *
   * @example
   * ```ts
   * .position((r) => r.position, { within: (r) => r.invoice_id })
   * .position((r) => r.position, { after: { resource: 'task_dependencies', field: 'task_id', key: 'depends_on_id', while: 'status != "done"' } })
   * ```
   */
  position(pick: (r: FieldRefs<F>) => Ref, o: { within?: (r: FieldRefs<F>) => Ref; after?: PositionAfterModel } = {}) {
    const within = o.within?.(this.refs()).name
    return this.next({ position: { field: pick(this.refs()).name, ...(within !== undefined && { within }), ...(o.after && { after: { ...o.after } }) } })
  }

  /**
   * A relation whose record each record belongs to, and the access on it writing them needs: creating a record, changing
   * it (the parent it leaves and the one it moves to), deleting and undeleting it all need `access` on the parent,
   * checked with the caller's own access rules on its resource and locked until the write commits. With `read`, every
   * read of its records (lists, counts, aggregates, gets and labels) also keeps to those whose parent the caller reads
   * there. A null relation checks nothing; each call adds a check. See
   * [Records that belong to another](website/src/content/docs/reference/access.mdx#records-that-belong-to-another).
   *
   * @example
   * ```ts
   * .parent((r) => r.vm_id, 'update')
   * ```
   */
  parent(pick: (r: FieldRefs<F>) => Ref, access: ParentAccess) {
    return this.next({ parents: [...(this.state.parents ?? []), { field: pick(this.refs()).name, access }] })
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

  /**
   * Lets the people who may read a record comment on it, and mention others who may read it too, who get an email. The
   * record page shows the thread with `l.comments()`, and admins list every comment as Comments. See
   * [Record comments](website/src/content/docs/reference/comments.mdx).
   */
  comments() {
    return this.next({ comments: true })
  }

  /**
   * Refreshes the pages open on its records and lists as soon as they change, from the API or elsewhere: the server
   * tells each open app which records changed, never their values, and the app reads them again as its user. See
   * [Live updates](website/src/content/docs/reference/live.mdx).
   */
  live() {
    return this.next({ live: true })
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
    return new ResourceBuilder<F, K>(this.state, [...this.validators, validator], this.accessRules, this.computedReveals)
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
    return new ResourceBuilder<F, K>(this.state, this.validators, { ...this.accessRules, ...rules }, this.computedReveals)
  }

  /**
   * Values revealed like sensitive fields, by name, but made when one is asked for instead of read from a column: a
   * secret another service keeps, or a file of settings built from several. `POST /{resource}/{key}:reveal` with
   * `{ "field": "<name>" }` answers one for a caller who may read the record, after the same audit event as a field's
   * reveal. Each call adds names, which no field may have. See
   * [Computed reveals](website/src/content/docs/reference/data-config.mdx#computed-reveals).
   *
   * @example
   * ```ts
   * .reveals({ env: { value: (app) => secrets.envFile(app.id), read: roles.is('owner'), strongSignIn: { minutes: 15 } } })
   * ```
   */
  reveals(reveals: Record<string, ComputedReveal<RecordOf<F>>>) {
    for (const [name, reveal] of Object.entries(reveals)) {
      if (Object.hasOwn(this.state.fields ?? {}, name)) throw new Error(`Resource "${this.state.name}": the reveal "${name}" has the name of a field`)
      const minutes = reveal.strongSignIn?.minutes
      if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1)) throw new Error(`Resource "${this.state.name}": the reveal "${name}" needs minutes of at least 1`)
    }
    return new ResourceBuilder<F, K>(this.state, this.validators, this.accessRules, { ...this.computedReveals, ...reveals })
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
    return new ResourceBuilder<F, K>({ ...this.state, ...patch }, this.validators, this.accessRules, this.computedReveals)
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
