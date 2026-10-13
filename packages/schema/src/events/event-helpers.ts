import type { EventOperation } from '../model'
import type { Ref } from '../refs'

/** Who made a write through the API; writes from anywhere else have none. */
export type EventActor = {
  /** The user's id. */
  id: string | number
  /** The user's roles. */
  roles: string[]
}

/**
 * One record's change in one transaction, as an event's `match` sees it. Records use field names and leave out
 * sensitive fields, whose names `changed` still lists.
 */
export type EventContext<R = Record<string, unknown>> = {
  /** What happened to the record. */
  operation: EventOperation
  /** The record before the change, as it was at the start of the transaction; none for a create. */
  before?: Partial<R>
  /** The record after the change, as it is at commit; none for a delete. */
  after?: Partial<R>
  /** The names of the fields that changed, sensitive ones included. */
  changed: string[]
  /** `null` for a write made outside the API (psql, another service, a database trigger). */
  actor: EventActor | null
  /** `api` for a write through the API, `database` for any other. */
  source: 'api' | 'database'
  /** The record's tenant, when the resource has one. */
  tenant?: string | number
  /** The writing transaction's id. */
  transaction: string
}

/** An event's code predicate: whether a change raises the event, for what a filter cannot say. */
export type EventMatch<R> = (context: EventContext<R>) => boolean

/** `when` and `from` are filters in the language of access rules and views, on the record after and before the change. */
export type CreatedOptions<R> = {
  /** A filter the created record meets. */
  when?: string
  /** A code predicate the change meets. */
  match?: EventMatch<R>
}

/** The conditions of `e.updated()`, which combine with AND. */
export type UpdatedOptions<R> = {
  /** A filter the record meets after the change. */
  when?: string
  /** A filter the record met before the change. */
  from?: string
  /** Fields of which one changed; it works on sensitive fields too. */
  changed?: Ref[]
  /** A code predicate the change meets. */
  match?: EventMatch<R>
}

/** The conditions of `e.deleted()`, which combine with AND. */
export type DeletedOptions<R> = {
  /** A filter the record met before it was deleted. */
  from?: string
  /** A code predicate the change meets. */
  match?: EventMatch<R>
}

/** The conditions of `e.undeleted()`, which combine with AND. */
export type UndeletedOptions<R> = {
  /** A filter the record meets once restored. */
  when?: string
  /** A filter the record met while deleted. */
  from?: string
  /** A code predicate the change meets. */
  match?: EventMatch<R>
}

/** An event as declared; `buildEventModels` checks it against the resource. */
export type EventSpec = {
  /** The event's name within the resource, such as `created`; the event is `<resource>.<name>`. */
  name: string
  /** The operations that may raise it. */
  operations: EventOperation[]
  /** A filter on the record after the change. */
  when?: string
  /** A filter on the record before the change. */
  from?: string
  /** A filter that turns true with the change. */
  becomes?: string
  /** The fields of which one must change, by name. */
  changed?: string[]
  /** A code predicate the change must meet. */
  match?: EventMatch<any>
  /** Kept only when the resource soft deletes: the `undeleted` of `e.crud()`. */
  softDeleteOnly?: true
}

type Options<R> = { when?: string; from?: string; changed?: Ref[]; match?: EventMatch<R> }

const spec = <R>(name: string, operation: EventOperation, { changed, ...options }: Options<R>): EventSpec => ({
  name,
  operations: [operation],
  ...options,
  ...(changed && { changed: changed.map((ref) => ref.name) }),
})

/** The `e` of `.events((e, r) => [...])`. Options combine with AND. */
export type EventHelpers<R> = {
  /** Fires when a record is created; named `created` unless `name` says otherwise. */
  created(name?: string, options?: CreatedOptions<R>): EventSpec
  /** Fires when a record is updated; named `updated` unless `name` says otherwise. */
  updated(name?: string, options?: UpdatedOptions<R>): EventSpec
  /** Fires when a record is deleted, soft deletes included; named `deleted` unless `name` says otherwise. */
  deleted(name?: string, options?: DeletedOptions<R>): EventSpec
  /** Fires when a soft deleted record is restored; named `undeleted` unless `name` says otherwise. */
  undeleted(name?: string, options?: UndeletedOptions<R>): EventSpec
  /** Fires when `condition` turns true: on a create that meets it, or an update after which it holds and before which it did not. */
  becomes(name: string, condition: string): EventSpec
  /** created, updated and deleted, plus undeleted when the resource soft deletes. */
  crud(): EventSpec[]
}

/** The helpers handed to `.events()`, typed against the resource's record `R`. */
export const eventHelpers = <R>(): EventHelpers<R> => {
  const created = (name = 'created', options: CreatedOptions<R> = {}) => spec(name, 'create', options)
  const updated = (name = 'updated', options: UpdatedOptions<R> = {}) => spec(name, 'update', options)
  const deleted = (name = 'deleted', options: DeletedOptions<R> = {}) => spec(name, 'delete', options)
  const undeleted = (name = 'undeleted', options: UndeletedOptions<R> = {}) => spec(name, 'undelete', options)
  return {
    created,
    updated,
    deleted,
    undeleted,
    becomes: (name, condition) => ({ name, operations: ['create', 'update'], becomes: condition }),
    crud: () => [created(), updated(), deleted(), { ...undeleted(), softDeleteOnly: true }],
  }
}
