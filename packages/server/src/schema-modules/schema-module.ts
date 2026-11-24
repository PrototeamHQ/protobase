import type { Db } from '@protobase/query'

// A built-in schema other than the auth store, such as the jobs schema, as a module: a chain of numbered steps that
// make its tables, and the derived objects over them, such as functions, views and triggers, which are replaced
// whole. `protobase migration` writes what the snapshot's model of it lacks; the server compares the record's model
// with the one this version reads, and never the database itself.

/**
 * One step of the chain, numbered from 1. Once released its statements never change: a later change to the module's
 * tables is a step of its own, with the next number.
 */
export type SchemaStep = {
  step: number
  name: string
  /** What it makes, the comment above its statements. */
  title: string
  /** Whether the code of the version before still runs once it is applied: a step that only adds is. */
  additive: boolean
  sql: string
}

/**
 * Derived objects written whole with `create or replace`, or dropped and made again, at a version: a change to them
 * bumps `version`. `compatibleFrom` is the oldest version whose code still runs on this one: replacing an older one
 * breaks older code, so the migration that does is not additive.
 */
export type Replaceable = { name: string; title: string; version: number; compatibleFrom: number; sql: string }

/** What a module has in the database, as the snapshot, the record and the runtime hold it. */
export type ModuleModel = { lastStep: number; replaceables: Record<string, number> }

export type SchemaModule = {
  /** What it is in messages, such as "the jobs schema". */
  label: string
  /** What a migration writes of it, the comment above its statements, such as "The jobs schema this version of Protobase needs". */
  title: string
  steps: SchemaStep[]
  /** In the order they are written, after the steps. */
  replaceables: Replaceable[]
  /**
   * What the database has of it, read once from its catalogue by `protobase migration baseline` and by a release's
   * migrate, which compare with the database; `undefined` when it has none of it. Throws on a state no step records.
   */
  read: (db: Db) => Promise<ModuleModel | undefined>
}
