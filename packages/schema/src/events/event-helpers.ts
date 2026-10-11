import type { EventOperation } from '../model'
import type { Ref } from '../refs'

/** Who made a write through the API; writes from anywhere else have none. */
export type EventActor = { id: string | number; roles: string[] }

/**
 * One record's change in one transaction, as an event's `match` sees it. Records use field names and leave out
 * sensitive fields, whose names `changed` still lists.
 */
export type EventContext<R = Record<string, unknown>> = {
  operation: EventOperation
  before?: Partial<R>
  after?: Partial<R>
  changed: string[]
  /** `null` for a write made outside the API (psql, another service, a database trigger). */
  actor: EventActor | null
  source: 'api' | 'database'
  tenant?: string | number
  /** The writing transaction's id. */
  transaction: string
}

export type EventMatch<R> = (context: EventContext<R>) => boolean

/** `when` and `from` are filters in the language of access rules and views, on the record after and before the change. */
export type CreatedOptions<R> = { when?: string; match?: EventMatch<R> }
export type UpdatedOptions<R> = { when?: string; from?: string; changed?: Ref[]; match?: EventMatch<R> }
export type DeletedOptions<R> = { from?: string; match?: EventMatch<R> }
export type UndeletedOptions<R> = { when?: string; from?: string; match?: EventMatch<R> }

/** An event as declared; `buildEventModels` checks it against the resource. */
export type EventSpec = {
  name: string
  operations: EventOperation[]
  when?: string
  from?: string
  becomes?: string
  changed?: string[]
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
export const eventHelpers = <R>() => {
  const created = (name = 'created', options: CreatedOptions<R> = {}) => spec(name, 'create', options)
  const updated = (name = 'updated', options: UpdatedOptions<R> = {}) => spec(name, 'update', options)
  const deleted = (name = 'deleted', options: DeletedOptions<R> = {}) => spec(name, 'delete', options)
  const undeleted = (name = 'undeleted', options: UndeletedOptions<R> = {}) => spec(name, 'undelete', options)
  return {
    created,
    updated,
    deleted,
    undeleted,
    /** Fires when `condition` turns true: on a create that meets it, or an update after which it holds and before which it did not. */
    becomes: (name: string, condition: string): EventSpec => ({ name, operations: ['create', 'update'], becomes: condition }),
    /** created, updated and deleted, plus undeleted when the resource soft deletes. */
    crud: (): EventSpec[] => [created(), updated(), deleted(), { ...undeleted(), softDeleteOnly: true }],
  }
}

export type EventHelpers<R> = ReturnType<typeof eventHelpers<R>>
