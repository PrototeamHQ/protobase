// protobase-try.exe: a local Protobase with workflows on, in one file. Without arguments it runs the launch flow (see
// launch.ts). With `serve`, `migrate` or `create-admin` it is the serve runtime, which the launch flow runs as its child
// processes.
import type { AppBundle } from './app-bundle'
import { launch } from './launch'

const runtimeCommands = ['serve', 'migrate', 'create-admin']

export const isRuntimeCommand = (argument: string | undefined) => runtimeCommands.includes(argument ?? '')

export const start = async (bundle: AppBundle, runtime: () => Promise<unknown>) => {
  if (isRuntimeCommand(process.argv[2])) await runtime()
  else await launch(bundle)
}
