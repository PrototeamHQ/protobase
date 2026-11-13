// protobase-try.exe: a local Protobase with workflows on, in one file. Without arguments it runs the launch flow (see
// launch.ts). With `serve`, `migrate` or `create-admin` it is the serve runtime, which the launch flow runs as its child
// processes.
import type { AppBundle } from './app-bundle'
import { launch } from './launch'

const runtimeCommands = ['serve', 'migrate', 'create-admin']

export const isRuntimeCommand = (argument: string | undefined) => runtimeCommands.includes(argument ?? '')

// The launch flow's one error handler: the reason in red, without a stack, for someone who only wanted to try it.
const failed = (error: unknown) => {
  console.error(`\x1b[31mProtobase stopped: ${error instanceof Error ? error.message : String(error)}\x1b[0m`)
  process.exit(1)
}

export const start = async (bundle: AppBundle, runtime: () => Promise<unknown>) => {
  if (isRuntimeCommand(process.argv[2])) await runtime()
  else await launch(bundle).catch(failed)
}
