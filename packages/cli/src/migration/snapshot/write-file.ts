import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nextMigrationName } from '../../auth/migration-file'
import { headerText, type Header } from './header'
import { nextSnapshot, snapshotHeader } from './next-snapshot'
import { writeSnapshot, type Snapshot } from './snapshot-file'

/** What a migration Protobase writes holds, under its header. */
export type FileContent = { name: string; body: string; kind?: Pick<Header, 'custom' | 'additive'> }

/** The next snapshot, but for the migration it ends at, which `writeMigrationFile` names. */
export type SnapshotDraft = { previous: Snapshot | undefined; auth: Snapshot['model']['auth']; organizationsOn: boolean; protobaseVersion: string }

/**
 * Writes `content` as the next numbered migration of `dir`, starting with its header and `id`, then rewrites the
 * project's snapshot to end at it. Returns the file's path.
 */
export const writeMigrationFile = async (projectDir: string, dir: string, content: FileContent, draft: SnapshotDraft, id: string) => {
  await mkdir(dir, { recursive: true })
  const file = nextMigrationName(await readdir(dir), content.name)
  const snapshot = nextSnapshot(draft.previous, draft.auth, draft.organizationsOn, { file, id }, draft.protobaseVersion)
  await writeFile(path.join(dir, file), `${headerText(snapshotHeader(snapshot, content.kind))}\n${content.body}`, { flag: 'wx' })
  await writeSnapshot(projectDir, snapshot)
  return path.join(dir, file)
}
