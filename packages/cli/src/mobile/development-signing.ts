import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type CaptureChild, captureChild } from './capture-child'
import { type ChildOptions, type RunChild, runChild } from './child-process'
import { withDevelopmentTeam } from './development-team'
import { connectedDevice, listIosTargets, provisioningBuildArgs } from './ios-device'

/**
 * Signs the iOS project `cap add` generated in `ws` for development by `team`, on every run since the project is
 * generated anew, and builds it once for the target, the connected device without one, letting Xcode create the
 * development profile. Gives the target for `cap run`.
 */
export const signForDevelopment = async (
  { ws, env, team, target }: { ws: string; env: ChildOptions['env']; team: string; target?: string },
  { run = runChild, capture = captureChild }: { run?: RunChild; capture?: CaptureChild },
) => {
  const pbxproj = path.join(ws, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj')
  await writeFile(pbxproj, withDevelopmentTeam(await readFile(pbxproj, 'utf8'), team))
  const chosen = target ?? connectedDevice(await listIosTargets(ws, env, capture))
  await run('xcrun', provisioningBuildArgs(ws, chosen), { cwd: path.join(ws, 'ios', 'App'), env })
  return chosen
}
