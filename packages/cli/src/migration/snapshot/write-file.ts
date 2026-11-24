import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nextMigrationName } from '../../auth/migration-file'
import { recordBlock, sqlHash } from '../record/record-block'
import { afterFileOf } from '../record/after-file'
import { headerText, type Header } from './header'
import { nextSnapshot, snapshotHeader } from './next-snapshot'
import { writeSnapshot, type Snapshot } from './snapshot-file'

/**
 * What a migration Protobase writes holds, under its header. `additive`: whether older code still runs on the database
 * once it is applied; a hand-written one leaves it, and its hash, to `migrate`, which reads them from the finished text.
 * `after`: the text of an `.after.sql` written beside it, which the file then waits on to be complete.
 */
export type FileContent = { name: string; body: string; kind?: Pick<Header, 'custom' | 'additive'>; additive: boolean; after?: string }

/**
 * The next snapshot, but for the migration it ends at, which `writeMigrationFile` names. `decisions`: those it goes on
 * from in place of the previous snapshot's, as a baseline reads them from the database.
 */
export type SnapshotDraft = { previous: Snapshot | undefined; auth: Snapshot['model']['auth']; organizationsOn: boolean; protobaseVersion: string; decisions?: Snapshot['decisions'] }

/**
 * Writes `content` as the next numbered migration of `dir`, starting with its header and `id` and ending with the row
 * that records it (`recordBlock`), then rewrites the project's snapshot to end at it. Returns the file's path.
 */
export const writeMigrationFile = async (projectDir: string, dir: string, content: FileContent, draft: SnapshotDraft, id: string) => {
  await mkdir(dir, { recursive: true })
  const file = nextMigrationName(await readdir(dir), content.name)
  const snapshot = nextSnapshot(draft.decisions ?? draft.previous?.decisions, draft.auth, draft.organizationsOn, { file, id }, draft.protobaseVersion)
  const text = `${headerText(snapshotHeader(snapshot, content.kind))}\n${content.body}\n`
  const custom = content.kind?.custom ?? false
  const row = {
    id,
    number: Number(file.split('_')[0]),
    name: file.replace(/\.sql$/, ''),
    protobaseVersion: snapshot.protobaseVersion,
    model: snapshot.model,
    modelHash: snapshot.modelHash,
    physical: snapshot.physical,
    additive: custom ? null : content.additive,
    completed: content.after === undefined,
  }
  await writeFile(path.join(dir, file), `${text}${recordBlock(row, custom ? null : sqlHash(text))}`, { flag: 'wx' })
  if (content.after !== undefined) await writeFile(path.join(dir, afterFileOf(file)), content.after, { flag: 'wx' })
  await writeSnapshot(projectDir, snapshot)
  return path.join(dir, file)
}
