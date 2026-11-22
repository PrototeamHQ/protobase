import type { Kysely } from 'kysely'
import type { AccessUser } from './access/types'

/** The caller of a write `.prepare()` runs for, as the server resolved it. */
export type PrepareSession = {
  /** The user, with the roles they act with. */
  user: AccessUser
  /** The tenant the write works in, for a resource with `.tenant()`. */
  tenant?: string | number
  /** A visitor without a token, through a public form. */
  anonymous?: true
}

/** What `.prepare()` gets besides the values: the write it prepares, its caller and its transaction. */
export type PrepareContext<R> = {
  /** The write being prepared. */
  operation: 'create' | 'update'
  /** The user who writes, with the roles they act with. */
  user: AccessUser
  /** The caller's session as the server resolved it. */
  session: PrepareSession
  /** The tenant the write works in, for a resource with `.tenant()`. */
  tenant?: string | number
  /** The write's transaction: what the hook reads or writes here commits with the record, or not at all. */
  trx: Kysely<any>
  /** On update, the record as it is stored now. */
  before?: R
}

/**
 * Fills in or rewrites a create's or update's values before they are written, inside the write's transaction: it gets
 * the values as validated and returns the values to write. It throws a {@link FieldIssue} to refuse the write.
 */
export type Preparer<R> = (values: Partial<R>, context: PrepareContext<R>) => Partial<R> | Promise<Partial<R>>

/** Thrown by `.prepare()` to refuse a write: it answers `422` with the field named. */
export class FieldIssue extends Error {
  constructor(
    /** The field it is about. */
    readonly field: string,
    /** What is wrong, for the user. */
    message: string,
  ) {
    super(message)
    this.name = 'FieldIssue'
  }
}
