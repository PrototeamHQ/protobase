import { schemaModules, type ModuleModel, type OffChoice, type SchemaModuleId } from '@protobase/server/internal'
import { authMigrationTitle } from '../../auth/migration-file'
import type { MigrationPart } from '../parts'
import { authDifference } from './auth-difference'
import { moduleChanges } from './module-changes'
import { defaultChosen, revivalRefused } from './module-prompts'
import { organizationsOffFacts, type OrganizationsOffFacts } from './organizations-off-facts'
import { revivedRows, type RevivedRows } from './revival-rows'
import { organizationsNow, type AuthTarget } from './auth-target'
import { refuseInconsistent } from './consistency'
import { breaksOlderCodeNote, olderCodeRefusal } from '../older-code/refusal'
import type { SectionContractions } from '../older-code/trial'
import { readMigrationFiles } from './migration-files'
import { moduleSections } from './module-sections'
import { runPreconditions } from './preconditions'
import { readSnapshot, snapshotFile, type KeptModule, type Snapshot } from './snapshot-file'
import { writeMigrationFile } from './write-file'

export type MigrationRun = {
  projectDir: string
  dir: string
  /** The config's auth store; `undefined` with sign-in off. */
  auth: AuthTarget | undefined
  /** The schema modules the config needs (`neededModules`), written from the snapshot like the auth store's steps. */
  modules: readonly SchemaModuleId[]
  /**
   * The parts compared with the database, its URL, what the file would take from older code there
   * (`trialContractions`), and what it has of a schema module (`SchemaModule.read`); `undefined` without `DATABASE_URL`.
   */
  database:
    | { url: string; parts: MigrationPart[]; contractions: (sections: readonly Section[]) => Promise<SectionContractions[]>; readModule: (id: SchemaModuleId) => Promise<ModuleModel | undefined> }
    | undefined
  protobaseVersion: string
  newId: () => string
  /** What becomes of the tables of a module the config turns off (`--off`); asked with `chooseOff` when undefined. */
  off?: OffChoice
  /** Asks what becomes of them, on a terminal; without it and without `off`, turning a module off is refused. */
  chooseOff?: (modules: readonly KeptModule[], facts?: OrganizationsOffFacts) => Promise<OffChoice>
  /** Asks whether the store's only organization, not the default one, becomes the default, as organizations turn off. */
  offerDefault?: (organization: NonNullable<OrganizationsOffFacts['only']>) => Promise<boolean>
  /** Brings back the rows a module turned on again kept (`--force`). */
  force?: boolean
  /** Asks whether to bring them back, on a terminal; without it and without `force`, they are refused. */
  confirmRevival?: (rows: RevivedRows) => Promise<boolean>
}

// Refuses a module turned on again while its kept tables hold rows, unless they are brought back.
const checkRevivals = async (url: string, run: MigrationRun, revived: readonly KeptModule[]) => {
  if (revived.length === 0 || run.force) return
  for (const rows of await revivedRows(url, run.auth!.names, revived)) {
    if (!(run.confirmRevival && (await run.confirmRevival(rows)))) throw new Error(revivalRefused(rows))
  }
}

// Refuses to write a module from its first step onto a database that has it already, as made by an earlier version's
// migration, which the snapshot does not record until a baseline reads it.
const refuseUnrecorded = async (read: (id: SchemaModuleId) => Promise<ModuleModel | undefined>, snapshot: Snapshot | undefined, sections: readonly { name: SchemaModuleId }[]) => {
  for (const { name } of sections) {
    if (snapshot?.model.modules?.[name] || !(await read(name))) continue
    throw new Error(`The database has ${schemaModules[name].label}, which ${snapshotFile} does not record: describe it with \`protobase migration baseline\`, run against the database with the project's migrations applied, then run \`protobase migration\` again`)
  }
}

// What goes dark as organizations turn off, read from the database, once the store's only organization is offered as the
// default: choosing it stops the run, for the config to name it first.
const offFacts = async (run: MigrationRun, turnedOff: readonly KeptModule[]) => {
  const defaultId = run.auth?.organizations?.default.id
  if (!run.database || defaultId === undefined || !turnedOff.some(({ module }) => module === 'organizations')) return
  const facts = await organizationsOffFacts(run.database.url, run.auth!.names, defaultId)
  if (facts.only && run.offerDefault && (await run.offerDefault(facts.only))) throw new Error(defaultChosen(facts.only))
  return facts
}

/** A section of the file: its part's name, and its text under the comment of its title. */
export type Section = { name: string; text: string }

const section = (title: string, sql: string) => `-- ${title}.\n${sql}\n`

/** The line `protobase migration`'s files open with, under their header. */
export const intro = `-- Written by \`protobase migration\` from the config and ${snapshotFile}; applied with the project's other migrations.\n`

/**
 * `protobase migration`: writes what the config needs as the project's next migration, one file, and rewrites the
 * snapshot to end at it. The auth store's steps and the schema modules' come from the snapshot alone; with a database,
 * the steps' checks run against its rows, and the other parts are compared with it. Every part is compared before anything is written. Returns the
 * file's path, `undefined` when nothing differs.
 */
export const runMigration = async (run: MigrationRun) => {
  const { projectDir, dir, auth, modules, database, protobaseVersion, newId } = run
  const snapshot = await readSnapshot(projectDir)
  const files = await readMigrationFiles(dir)
  refuseInconsistent(snapshot, files)
  if (!snapshot && auth && files.some(({ text }) => text.includes(authMigrationTitle))) {
    throw new Error(`The project has auth migrations from before ${snapshotFile}: start it with \`protobase migration baseline\`, run against the database with the project's migrations applied, then run \`protobase migration\` again`)
  }
  const { off: turnedOff } = moduleChanges(snapshot, auth)
  const off = run.off ?? (turnedOff.length > 0 && run.chooseOff ? await run.chooseOff(turnedOff, await offFacts(run, turnedOff)) : undefined)
  const difference = authDifference(snapshot, auth, off)
  if (database) await checkRevivals(database.url, run, difference.changes.revived)
  if (database && difference.migration && difference.migration.checks.length > 0) await runPreconditions(database.url, difference.migration.checks)
  const written = moduleSections(snapshot, modules)
  if (database) await refuseUnrecorded(database.readModule, snapshot, written.sections)
  const compared: Section[] = []
  for (const part of database?.parts ?? []) {
    const sql = await part.sql({ authWritten: Boolean(difference.migration) })
    if (sql !== undefined) compared.push({ name: part.name, text: section(part.title, sql) })
  }
  // The schema modules go before the compared parts, whose triggers call into them, such as jobs.enqueue().
  const sections = [
    ...(difference.migration ? [{ name: 'auth', text: section(authMigrationTitle, difference.migration.sql) }] : []),
    ...written.sections.map(({ name, title, sql }) => ({ name, text: section(title, sql) })),
    ...compared,
  ]
  if (sections.length === 0) return
  // The sign-in modules' steps and the schema modules' are Protobase's own paths: what they take from older code makes
  // the file break it. What another part takes is refused. Without a database the file holds only the steps, read as
  // they lint (`step-lint.ts`).
  const own = new Set<string>(['auth', ...modules])
  const found = database ? await database.contractions(sections) : []
  const refused = found.filter(({ name }) => !own.has(name))
  if (refused.length > 0) throw new Error(olderCodeRefusal(refused))
  const label = (name: string) => (name === 'auth' ? "The sign-in modules' steps" : schemaModules[name as SchemaModuleId].title)
  const breaking = [
    ...found.flatMap(({ name, found: lines }) => lines.map((line) => `${label(name)}: ${line}`)),
    ...written.sections.flatMap(({ title, breaks }) => breaks.map((line) => `${title}: ${line}`)),
  ]
  const after = difference.migration?.after
  const content = {
    name: sections.map(({ name }) => name).join('_'),
    body: [intro, ...(breaking.length > 0 ? [breaksOlderCodeNote(breaking)] : []), ...sections.map(({ text }) => text)].join('\n'),
    additive: breaking.length === 0,
    ...(breaking.length > 0 && { kind: { custom: false, additive: false, breaksOlderCode: true } }),
    ...(after && { after }),
  }
  const decisions = snapshot && { ...snapshot.decisions, modules: { ...snapshot.decisions.modules, kept: difference.kept } }
  const draft = { previous: snapshot, auth: difference.model, modules: written.model, organizations: organizationsNow(auth), protobaseVersion, ...(decisions && { decisions }) }
  return writeMigrationFile(projectDir, dir, content, draft, newId())
}
