import type { Db } from '@protobase/query'

// A built-in schema other than the auth store, such as the jobs schema, as a module: a chain of numbered steps that
// make its tables, and the derived objects over them, such as functions, views and triggers, which are replaced
// whole. `protobase migration` writes what the snapshot's model of it lacks; the server compares the record's model
// with the one this version reads, and never the database itself.

/** The names a module's statements take from the app's config, such as the schema it lives in, by role. */
export type ModuleNames = Record<string, string>

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
  sql: (names: ModuleNames) => string
}

/**
 * Derived objects written whole with `create or replace`, or dropped and made again, at a version: a change to them
 * bumps `version`. `compatibleFrom` is the oldest version whose code still runs on this one: replacing an older one
 * breaks older code, so the migration that does is not additive.
 */
export type Replaceable = { name: string; title: string; version: number; compatibleFrom: number; sql: (names: ModuleNames) => string }

/** A table as SQL names it, unqualified without `schema`. */
export type TableName = { schema?: string; name: string }

/**
 * Derived objects of each of the app's resources that need them, such as the triggers that capture a resource's
 * changes, written whole for one resource from its input (`ResourceInput`) at a version, as a `Replaceable` is: once
 * more when its statements change. `drop` removes what it made on `table`; a resource that no longer needs them keeps
 * them while another resource still does when `keptWhileOthers`, and loses them once none does.
 */
export type ResourceReplaceable = {
  name: string
  /** What it makes for one resource, the comment above its statements, followed by the resource's name. */
  title: string
  version: number
  compatibleFrom: number
  sql: (names: ModuleNames, input: unknown) => string
  drop: (names: ModuleNames, table: TableName) => string
  keptWhileOthers: boolean
}

/**
 * One resource's input to a `ResourceReplaceable`: the table its objects are on, and what its statements are made
 * from. `kept`: the resource no longer needs them, so they are written only to follow it while they are kept.
 */
export type ResourceInput = { table: TableName; input: unknown; kept?: boolean }

/** What the app gives a module: its names, and each resource replaceable's input by resource. */
export type ModuleInput = { names: ModuleNames; resources: Record<string, Record<string, ResourceInput>> }

/** The input of a module that takes nothing from the app. */
export const noInput: ModuleInput = { names: {}, resources: {} }

/** One resource's objects as the model holds them: their version, a digest of their statements, and their table. */
export type ResourceEntry = { version: number; digest: string; table: TableName }

/**
 * What a module has in the database, as the snapshot, the record and the runtime hold it: `names` and `resources`, by
 * resource replaceable then resource, only when it has any.
 */
export type ModuleModel = { lastStep: number; replaceables: Record<string, number>; names?: ModuleNames; resources?: Record<string, Record<string, ResourceEntry>> }

export type SchemaModule = {
  /** What it is in messages, such as "the jobs schema". */
  label: string
  /** What a migration writes of it, the comment above its statements, such as "The jobs schema this version of Protobase needs". */
  title: string
  steps: SchemaStep[]
  /** In the order they are written, after the steps. */
  replaceables: Replaceable[]
  /** Written after the replaceables, each resource's in the order of the input. */
  resourceReplaceables: ResourceReplaceable[]
  /**
   * What the database has of it for `input`, read once from its catalogue by `protobase migration baseline` and by a
   * release's migrate, which compare with the database; `undefined` when it has none of it. Throws on a state no step
   * records.
   */
  read: (db: Db, input: ModuleInput) => Promise<ModuleModel | undefined>
}
