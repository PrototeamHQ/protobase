import { checkFormat, readSnapshotJson, snapshotFile, snapshotFormat, writeSnapshot, type Snapshot } from './snapshot-file'

/** How each format becomes the next, by the format it upgrades: none yet, as format 1 is the first. */
type Upgrade = (snapshot: { format: number }) => { format: number }

const upgrades: Record<number, Upgrade> = {}

/**
 * `protobase migration up`: rewrites the project's snapshot in this version's format. Refuses a newer format, which
 * only a newer Protobase reads. Returns what it did.
 */
export const upgradeSnapshot = async (projectDir: string) => {
  const found = await readSnapshotJson(projectDir)
  if (!found) throw new Error(`The project has no ${snapshotFile}`)
  let json = found
  if (json.format === snapshotFormat) return `${snapshotFile} is format ${snapshotFormat} already`
  if (json.format > snapshotFormat) checkFormat(json.format)
  const from = json.format
  while (json.format < snapshotFormat) {
    const upgrade: Upgrade | undefined = upgrades[json.format]
    if (!upgrade) throw new Error(`${snapshotFile} is format ${json.format}, which no version of Protobase wrote`)
    json = upgrade(json)
  }
  await writeSnapshot(projectDir, json as Snapshot)
  return `upgraded ${snapshotFile} from format ${from} to ${snapshotFormat}`
}
