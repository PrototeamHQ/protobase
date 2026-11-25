import { readdir } from 'node:fs/promises'
import { archiveSchema, archiveStatements, archivedModule, markedSql, revokeStatements, signOffGate, type DeferredOff, type KeptModule } from '@protobase/server/internal'
import { nextMigrationName } from '../../auth/migration-file'
import { refuseInconsistent } from '../snapshot/consistency'
import { readMigrationFiles } from '../snapshot/migration-files'
import { readSnapshot, snapshotFile } from '../snapshot/snapshot-file'
import { writeMigrationFile } from '../snapshot/write-file'
import { signedOffFile } from './signed-off-file'

export type SignOffRun = { projectDir: string; dir: string; hours: number; protobaseVersion: string; newId: () => string }

type Deferred = KeptModule & { off: DeferredOff }

/** The line `protobase migration contract`'s files open with, under their header. */
export const contractIntro = '-- Written by `protobase migration contract`: it signs off the update of each migration it names, and archives what that update retired.\n'

/**
 * `protobase migration contract`: writes the next migration, which archives each sign-in module turned off with
 * `--off archive` or `--off delete`, behind a check that refuses until the file that turned it off was applied `hours`
 * ago and another after it; every statement names that file with `-- protobase:contract`. The snapshot moves the
 * modules from `kept` to `archived`. Returns the file's path.
 */
export const writeContract = async ({ projectDir, dir, hours, protobaseVersion, newId }: SignOffRun) => {
  const snapshot = await readSnapshot(projectDir)
  const files = await readMigrationFiles(dir)
  refuseInconsistent(snapshot, files)
  const deferred = (snapshot?.decisions.modules.kept ?? []).filter((kept): kept is Deferred => kept.off !== undefined)
  if (!snapshot?.model.auth || deferred.length === 0) throw new Error(`Nothing awaits a sign-off: ${snapshotFile} has no sign-in module turned off with \`--off archive\` or \`--off delete\``)
  const store = snapshot.model.auth.schema
  const schema = archiveSchema(Number(nextMigrationName(await readdir(dir), 'contract').split('_')[0]))
  const signedOff = [...new Set(deferred.map(({ off }) => off.file))].map((id) => signedOffFile(files, id))
  const id = newId()
  const body = [
    contractIntro,
    ...signedOff.map((file) => `-- The sign-off of ${file.name}: it applies once that file was applied ${hours} hours ago, and a migration after it.\n${markedSql(file.id, [signOffGate(file, hours, 'The sign-off', true)])}\n`),
    ...deferred.map(({ off, ...kept }) => `-- ${kept.module} archived to ${schema}: its tables, with no foreign key to the tables still on, and each column it retired as <column>_archive, all still watched in retired.writes.\n${markedSql(off.file, archiveStatements(store, schema, { ...kept, off }))}\n`),
    `-- Nothing but a superuser uses ${schema}: the app's roles and the one applying this file are refused.\n${markedSql(deferred[0]!.off.file, revokeStatements(schema))}\n`,
  ].join('\n')
  const decisions = {
    ...snapshot.decisions,
    modules: { kept: snapshot.decisions.modules.kept.filter((kept) => kept.off === undefined), archived: [...snapshot.decisions.modules.archived, ...deferred.map((kept) => archivedModule(store, schema, kept, id))] },
  }
  const content = { name: 'contract', body, additive: false, kind: { custom: false, additive: false, breaksOlderCode: true } }
  const draft = { previous: snapshot, auth: snapshot.model.auth, modules: snapshot.model.modules, organizations: { on: false }, protobaseVersion, decisions }
  return writeMigrationFile(projectDir, dir, content, draft, id)
}
