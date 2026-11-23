import { readSavedPort } from '../dev/dev-port'

/** The port of the `protobase dev` that `--live` opens: `--port`, else the one dev keeps for the project. */
export const livePort = async (projectDir: string, chosen: number | undefined) => {
  if (chosen !== undefined) return chosen
  const saved = await readSavedPort(projectDir)
  if (saved === undefined) throw new Error('--live opens protobase dev, which has kept no port in this project yet: run protobase dev first, or pass --port <port>')
  return saved
}
