import { deleteStatements, markedSql, signOffGate, stepRecordOf } from '@protobase/server/internal'
import { refuseInconsistent } from '../snapshot/consistency'
import { readMigrationFiles } from '../snapshot/migration-files'
import { readSnapshot, snapshotFile } from '../snapshot/snapshot-file'
import { writeMigrationFile } from '../snapshot/write-file'
import type { SignOffRun } from './contract'
import { signedOffFile } from './signed-off-file'

/**
 * `protobase migration delete <module>`: writes the next migration, which drops what the sign-off archived of
 * `module`, its tables and its column archives, and while it is off its rows in `auth_steps`, behind checks that
 * refuse until the archive was applied `hours` ago and while `retired.writes` counts a write of it within them, or does
 * not watch it. The snapshot no longer lists it as archived. Returns the file's path.
 */
export const writeDelete = async ({ projectDir, dir, hours, protobaseVersion, newId, module }: SignOffRun & { module: string }) => {
  const snapshot = await readSnapshot(projectDir)
  const files = await readMigrationFiles(dir)
  refuseInconsistent(snapshot, files)
  const archived = snapshot?.decisions.modules.archived ?? []
  const entry = archived.find((found) => found.module === module)
  if (!snapshot?.model.auth || !entry) {
    const listed = archived.length === 0 ? 'none is' : `${archived.map((found) => found.module).join(', ')} ${archived.length === 1 ? 'is' : 'are'}`
    throw new Error(`${module} has no archive to delete: ${listed} archived in ${snapshotFile}. A module turned off is archived by \`protobase migration contract\` once turned off with \`--off archive\` or \`--off delete\``)
  }
  const archive = signedOffFile(files, entry.file)
  // A module on again after its archive started its steps again, whose rows stay.
  const steps = snapshot.model.auth.modules[entry.module] ? undefined : stepRecordOf(snapshot.model.auth)
  const body = [
    `-- Written by \`protobase migration delete ${module}\`: it drops for good what ${archive.name} archived of ${module}.\n`,
    `-- It applies once ${archive.name} was applied ${hours} hours ago, and while retired.writes counts no write of what it drops within them.\n${markedSql(archive.id, [signOffGate(archive, hours, `Deleting ${module}`, false), ...deleteStatements(entry, hours, steps)])}\n`,
  ].join('\n')
  const decisions = { ...snapshot.decisions, modules: { ...snapshot.decisions.modules, archived: archived.filter((found) => found !== entry) } }
  const content = { name: `delete_${module}`, body, additive: false }
  const draft = { previous: snapshot, auth: snapshot.model.auth, modules: snapshot.model.modules, organizations: { on: false }, protobaseVersion, decisions }
  return writeMigrationFile(projectDir, dir, content, draft, newId())
}
