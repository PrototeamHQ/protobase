import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DefaultOrganization } from '@protobase/server'
import { modelHash as recordModelHash, type KeptModule, type StoreModel } from '@protobase/server/internal'

// `protobase.snapshot.json`: the schema the project's migrations make, which `protobase migration` compares with what
// the config and this version of Protobase would make. Each migration it writes rewrites it, so the change shows in review.

export const snapshotFile = 'protobase.snapshot.json'

/** A module turned off whose tables and rows the database keeps: the last step it had, and its tables' names then. */
export type { KeptModule }

/** The format this version of Protobase reads and writes; `protobase migration up` upgrades an older one. */
export const snapshotFormat = 1

export type Snapshot = {
  format: number
  /** The version of Protobase that wrote it. */
  protobaseVersion: string
  /** The migration it ends at: the newest file Protobase wrote, by name and id. */
  endsAt: { file: string; id: string }
  /** The SHA-256 of `model` as written, which a hand-merged snapshot no longer matches. */
  modelHash: string
  /** What the runtime reads, by part: the auth store when sign-in is on. */
  model: { auth?: StoreModel }
  /** What the migrations decided that the model does not show. */
  decisions: {
    /** The modules kept once turned off, each at the last step it had then, and those archived. */
    modules: { kept: KeptModule[]; archived: string[] }
    /**
     * Whether organizations were ever on, and the organization that stands in while they are off, as the config's
     * `organizations.default` gave it; `null` before it did.
     */
    organizations: { everOn: boolean; defaultOrganization: DefaultOrganization | null }
    /** The relations of the store Protobase did not make, such as a user view over another system's users, which no step alters; none when absent. */
    external?: string[]
  }
  /** Every name the migrations make, by part. */
  physical: { auth?: string[] }
}

/** The model's hash, as the record of migrations and the server's startup compare it. */
export const modelHash = (model: Snapshot['model']) => recordModelHash(model)

/** The file's text: two-space JSON and a final newline, so the same snapshot is the same bytes. */
export const snapshotText = (snapshot: Snapshot) => `${JSON.stringify(snapshot, null, 2)}\n`

/** The snapshot's JSON as it stands, of any format; `undefined` when the project has none. */
export const readSnapshotJson = async (projectDir: string): Promise<{ format: number } | undefined> => {
  const file = path.join(projectDir, snapshotFile)
  if (!existsSync(file)) return
  const text = await readFile(file, 'utf8')
  if (/^(<{7}|>{7}|={7})/m.test(text)) {
    throw new Error(`${snapshotFile} has a merge conflict: delete this branch's newest migration, take the other branch's ${snapshotFile}, and run \`protobase migration\` again`)
  }
  return JSON.parse(text) as { format: number }
}

/** Refuses a format other than this version's: a newer one needs a newer Protobase, an older one `migration up`. */
export const checkFormat = (format: number) => {
  if (format > snapshotFormat) throw new Error(`${snapshotFile} is format ${format}, which a newer Protobase wrote; this one reads format ${snapshotFormat}: upgrade Protobase`)
  if (format < snapshotFormat) throw new Error(`${snapshotFile} is format ${format}; this Protobase reads format ${snapshotFormat}: run \`protobase migration up\``)
}

/** Refuses kept modules recorded without their step and tables, which `protobase migration baseline` writes again. */
const checkKept = (snapshot: Snapshot) => {
  const named = snapshot.decisions.modules.kept.filter((kept) => typeof kept !== 'object' || kept === null || typeof kept.step !== 'number' || typeof kept.tables !== 'object')
  if (named.length === 0) return
  throw new Error(`${snapshotFile} keeps ${named.map(String).join(', ')} without the step and tables it had: start the snapshot again with \`protobase migration baseline\``)
}

/** The project's snapshot; `undefined` when it has none. */
export const readSnapshot = async (projectDir: string): Promise<Snapshot | undefined> => {
  const json = await readSnapshotJson(projectDir)
  if (!json) return
  checkFormat(json.format)
  checkKept(json as Snapshot)
  return json as Snapshot
}

export const writeSnapshot = (projectDir: string, snapshot: Snapshot) => writeFile(path.join(projectDir, snapshotFile), snapshotText(snapshot))

export const removeSnapshot = (projectDir: string) => rm(path.join(projectDir, snapshotFile))
